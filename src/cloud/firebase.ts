import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  inMemoryPersistence,
  type User,
} from 'firebase/auth'
import {
  getFirestore,
  doc,
  collection,
  getDocFromServer as getDoc,
  getDocsFromServer as getDocs,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore'
import type { Backup, Entity, Profile } from '../core/types'
import { validateEntity } from '../core/validation'
import { localDate, monthRange, weekRange } from '../core/dates'
import type { Transport } from './sync'
import type { Repository } from '../data/repository'
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}
export const configured = Object.values(config).every((v) => typeof v === 'string' && v.length > 0)
function services(name = 'water-v3') {
  if (!configured) throw new Error('此安装未配置云服务；本地记录和导出仍可使用')
  const app = getApps().find((a) => a.name === name) ?? initializeApp(config, name)
  return { auth: getAuth(app), db: getFirestore(app) }
}
export function watchAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(services().auth, callback)
}
export async function login(email: string, password: string, register = false) {
  const auth = services().auth
  return (
    await (register
      ? createUserWithEmailAndPassword(auth, email, password)
      : signInWithEmailAndPassword(auth, email, password))
  ).user
}
export async function logout() {
  await signOut(services().auth)
}
export async function resetPassword(email: string) {
  await sendPasswordResetEmail(services().auth, email)
}
export function transportFor(uid: string, override?: Firestore): Transport {
  const db = override ?? services().db
  const profile: Profile = `user:${uid}`
  const account = doc(db, 'accounts', uid)
  return {
    async head() {
      return Number((await getDoc(account)).data()?.seq ?? 0)
    },
    async changes(after, through) {
      const result = await getDocs(
        query(
          collection(account, 'entities'),
          where('changeSeq', '>', after),
          where('changeSeq', '<=', through),
          orderBy('changeSeq'),
          limit(100),
        ),
      )
      return {
        entities: result.docs.map((d) => validateEntity(d.data(), profile)),
        cursor: result.empty ? through : Number(result.docs.at(-1)!.data().changeSeq),
      }
    },
    async commit(op) {
      if (op.profile !== profile) throw new Error('同步操作不属于当前账号')
      return runTransaction(db, async (tx) => {
        const receiptRef = doc(account, 'operations', op.id)
        const entityRef = doc(account, 'entities', op.entityId)
        const receipt = await tx.get(receiptRef)
        const snapshot = await tx.get(entityRef)
        const meta = await tx.get(account)
        const remote = snapshot.exists() ? validateEntity(snapshot.data(), profile) : undefined
        if (receipt.exists()) {
          if (!remote) throw new Error('云端回执缺少对应记录')
          return { kind: 'applied' as const, entity: remote }
        }
        if (remote && (remote.deleted || (remote.version !== op.baseVersion && !op.entity.deleted)))
          return { kind: 'conflict' as const, entity: remote }
        if (!remote && op.baseVersion !== 0) throw new Error('云端记录缺失，请保留本地备份并重试')
        const seq = Number(meta.data()?.seq ?? 0) + 1
        const entity = validateEntity({ ...op.entity, version: (remote?.version ?? 0) + 1 }, profile)
        tx.set(account, { seq }, { merge: true })
        tx.set(entityRef, { ...entity, changeSeq: seq })
        tx.set(receiptRef, { entityId: entity.id, version: entity.version, createdAt: serverTimestamp() })
        return { kind: 'applied' as const, entity }
      })
    },
  }
}
export async function freezeLegacyWrites(uid: string, override?: Firestore) {
  await setDoc(doc(override ?? services().db, 'accounts', uid), { migrated: true }, { merge: true })
}
export async function readLegacyCloud(uid: string, override?: Firestore): Promise<Backup> {
  const db = override ?? services().db
  const records = await getDocs(collection(db, 'users', uid, 'records'))
  const settings = await getDoc(doc(db, 'users', uid, 'settings', 'main'))
  const profile: Profile = `user:${uid}`
  const entities: Entity[] = records.docs
    .filter((d) => d.data().amount > 0)
    .map((d) =>
      validateEntity({
        id: `legacy-cloud-${uid}-${d.id}`,
        profile,
        kind: 'legacy',
        date: d.id,
        originalDate: d.id,
        amountMl: d.data().amount,
        origin: `v2-cloud-utc:${uid}`,
        version: 1,
        updatedAt: Date.now(),
        deleted: false,
      }),
    )
  if (settings.data()?.goal)
    entities.push(
      validateEntity({
        id: `goal-${localDate()}`,
        profile,
        kind: 'goal',
        date: localDate(),
        amountMl: settings.data()!.goal,
        version: 1,
        updatedAt: Date.now(),
        deleted: false,
      }),
    )
  return { format: 'health-water', version: 3, exportedAt: new Date().toISOString(), entities }
}
export async function readLegacyWithCredentials(email: string, password: string): Promise<Backup> {
  const { auth, db } = services('water-legacy-reader')
  await setPersistence(auth, inMemoryPersistence)
  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password)
    return await readLegacyCloud(user.uid, db)
  } finally {
    await signOut(auth)
  }
}
export interface BoardRow {
  uid: string
  nickname: string
  weekStart: string
  monthStart: string
  weekDays: number
  monthDays: number
}
export async function publishSummary(
  repo: Repository,
  uid: string,
  nickname: string,
  enabled: boolean,
  explicit = false,
  override?: Firestore,
) {
  const db = override ?? services().db
  const ref = doc(db, 'leaderboard', uid)
  const consentRef = doc(db, 'accounts', uid, 'preferences', 'leaderboard')
  if (!enabled) {
    await runTransaction(db, async (tx) => {
      tx.set(consentRef, { enabled: false, nickname: '' })
      tx.delete(ref)
    })
    await repo.setSetting(`boardHash:${uid}`, '')
    return
  }
  if (!nickname.trim() || nickname.length > 24 || nickname.includes('@'))
    throw new Error('公开昵称请使用 1–24 个字符，不要填写邮箱')
  const [ws, we] = weekRange(localDate())
  const [ms, me] = monthRange(localDate())
  const days = await repo.days(`user:${uid}`, ws < ms ? ws : ms, we > me ? we : me)
  const achieved = days.filter((d) => d.entryCount > 0 && d.goalMl !== null && d.entryTotalMl >= d.goalMl)
  const value = {
    nickname: nickname.trim(),
    weekStart: ws,
    monthStart: ms,
    weekDays: achieved.filter((d) => d.date >= ws && d.date <= we).length,
    monthDays: achieved.filter((d) => d.date >= ms && d.date <= me).length,
  }
  const previousHash = await repo.setting(`boardHash:${uid}`, '')
  const result = await runTransaction(db, async (tx) => {
    const consent = (await tx.get(consentRef)).data()
    if (!explicit && !consent?.enabled) return null
    const summary = { ...value, nickname: explicit ? value.nickname : String(consent!.nickname) }
    const hash = JSON.stringify(summary)
    if (explicit) tx.set(consentRef, { enabled: true, nickname: summary.nickname })
    if (explicit || previousHash !== hash) tx.set(ref, { ...summary, updatedAt: serverTimestamp() })
    return { hash, nickname: summary.nickname }
  })
  await repo.setSetting(`boardHash:${uid}`, result?.hash ?? '')
  await repo.setSetting(`board:user:${uid}`, {
    enabled: result !== null,
    nickname: result?.nickname ?? nickname,
  })
}
export async function leaderboard(period: 'week' | 'month'): Promise<BoardRow[]> {
  const { db } = services()
  const start = (period === 'week' ? weekRange : monthRange)(localDate())[0]
  const result = await getDocs(
    query(
      collection(db, 'leaderboard'),
      where(`${period}Start`, '==', start),
      where(`${period}Days`, '>', 0),
      orderBy(`${period}Days`, 'desc'),
      limit(20),
    ),
  )
  return result.docs.map((d) => ({ ...d.data(), uid: d.id }) as BoardRow)
}
