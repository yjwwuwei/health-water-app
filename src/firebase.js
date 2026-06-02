// Firebase 配置
// 你需要在 https://console.firebase.google.com 创建项目，然后填入下面的配置
import { initializeApp } from 'firebase/app'
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore'

// ============================================
// 替换为你自己的 Firebase 配置
// ============================================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

// ============ Auth Functions ============

// 邮箱注册
export async function registerWithEmail(email, password, nickname) {
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  // 创建用户文档
  await setDoc(doc(db, 'users', cred.user.uid), {
    nickname: nickname || email.split('@')[0],
    email,
    createdAt: serverTimestamp(),
  })
  return cred.user
}

// 邮箱登录
export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

// 手机号登录（需要在 Firebase 控制台开启 Phone 认证）
export async function loginWithPhone(phoneNumber, appVerifier) {
  const confirmation = await signInWithPhoneNumber(auth, phoneNumber, appVerifier)
  return confirmation // 返回 confirmation 用于输入验证码
}

// 游客登录
export async function loginAnonymously() {
  const cred = await signInAnonymously(auth)
  return cred.user
}

// 退出登录
export async function logout() {
  await signOut(auth)
}

// 监听登录状态
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback)
}

// ============ Firestore Functions ============

// 保存用户喝水数据到云端
export async function syncToCloud(uid, records, goal) {
  // 保存每条记录
  const batch = []
  for (const [date, amount] of Object.entries(records)) {
    batch.push(
      setDoc(doc(db, 'users', uid, 'records', date), {
        date,
        amount,
        updatedAt: serverTimestamp(),
      })
    )
  }
  // 保存设置
  batch.push(
    setDoc(doc(db, 'users', uid, 'settings', 'main'), {
      goal,
      updatedAt: serverTimestamp(),
    })
  )
  await Promise.all(batch)
}

// 从云端加载数据
export async function loadFromCloud(uid) {
  const recordsSnap = await getDocs(collection(db, 'users', uid, 'records'))
  const records = {}
  recordsSnap.forEach(doc => {
    const data = doc.data()
    records[data.date] = data.amount
  })

  const settingsSnap = await getDoc(doc(db, 'users', uid, 'settings', 'main'))
  const goal = settingsSnap.exists() ? settingsSnap.data().goal : 2000

  return { records, goal }
}

// ============ Leaderboard Functions ============

// 获取排行榜（按总饮水量）
export async function getLeaderboard(type = 'weekly', limitCount = 20) {
  const usersSnap = await getDocs(collection(db, 'users'))
  const entries = []

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data()
    const uid = userDoc.id

    // 获取该用户的记录
    const recordsSnap = await getDocs(collection(db, 'users', uid, 'records'))
    const records = {}
    recordsSnap.forEach(doc => {
      const data = doc.data()
      records[data.date] = data.amount
    })

    let totalAmount = 0
    let daysCount = 0
    let streak = 0
    const today = new Date()

    if (type === 'weekly') {
      // 本周总饮水量
      for (let i = 0; i < 7; i++) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().slice(0, 10)
        if (records[dateStr]) {
          totalAmount += records[dateStr]
          daysCount++
        }
      }
    } else if (type === 'monthly') {
      // 本月总饮水量
      for (let i = 0; i < 30; i++) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().slice(0, 10)
        if (records[dateStr]) {
          totalAmount += records[dateStr]
          daysCount++
        }
      }
    } else if (type === 'streak') {
      // 连续打卡天数
      for (let i = 0; i < 3650; i++) { // 最多10年
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().slice(0, 10)
        if (records[dateStr] && records[dateStr] > 0) {
          streak++
        } else {
          break
        }
      }
    }

    if (type === 'streak') {
      entries.push({
        uid,
        nickname: userData.nickname || '匿名用户',
        streak,
        totalAmount: 0,
        daysCount: 0,
      })
    } else {
      entries.push({
        uid,
        nickname: userData.nickname || '匿名用户',
        totalAmount,
        daysCount,
        streak: 0,
      })
    }
  }

  // 排序
  if (type === 'streak') {
    entries.sort((a, b) => b.streak - a.streak)
  } else {
    entries.sort((a, b) => b.totalAmount - a.totalAmount)
  }

  return entries.slice(0, limitCount)
}
