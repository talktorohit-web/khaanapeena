// Real accounts via Firebase Authentication (email + password), reusing the
// same Firebase project as cloud sync. An owner signs up once; their restaurant
// is bound to their uid under kp_users/{uid} so signing in on any device loads it.
import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail, signInAnonymously,
} from 'firebase/auth'
import { getDatabase, ref, get, set } from 'firebase/database'

const CFG = {
  apiKey: 'AIzaSyA_CyEUErQ9I1Cs0gAGP6hPmhq9AUbo_R8',
  authDomain: 'nexuschat-ccb15.firebaseapp.com',
  projectId: 'nexuschat-ccb15',
  databaseURL: 'https://nexuschat-ccb15-default-rtdb.firebaseio.com',
  appId: '1:79966594070:web:1e122ae6db3764811b4137',
}
const app = () => (getApps().length ? getApps()[0] : initializeApp(CFG))
const auth = () => getAuth(app())
const db = () => getDatabase(app())

// friendlier messages than Firebase's raw codes
export function authError(e) {
  const c = e?.code || ''
  if (c.includes('email-already-in-use')) return 'That email already has an account — sign in instead.'
  if (c.includes('invalid-email')) return 'That email address looks invalid.'
  if (c.includes('weak-password')) return 'Password is too weak — use at least 6 characters.'
  if (c.includes('wrong-password') || c.includes('invalid-credential')) return 'Wrong email or password.'
  if (c.includes('user-not-found')) return 'No account with that email — sign up first.'
  if (c.includes('too-many-requests')) return 'Too many attempts — wait a minute and try again.'
  if (c.includes('network')) return 'No internet — check your connection.'
  if (c.includes('operation-not-allowed')) return 'Email sign-in is not enabled for this project.'
  return e?.message || 'Something went wrong.'
}

export const onAuth = (cb) =>
  onAuthStateChanged(auth(), (u) => cb(u ? { uid: u.uid, email: u.email } : null))

// current user's Firebase ID token — the dual-write API verifies this and maps it
// to the caller's org/outlet/role (the JWT claims that back Postgres RLS)
export const getIdToken = async () => {
  const u = auth().currentUser
  return u ? u.getIdToken() : ''
}

// guest QR ordering: sign the phone in anonymously so its writes carry an auth token
// (the rules require auth != null) — makes guest orders attributable + rate-limitable
export const signInAnon = async () => {
  const a = auth()
  if (a.currentUser) return a.currentUser
  return (await signInAnonymously(a)).user
}

export const signUp = (email, password) => createUserWithEmailAndPassword(auth(), email.trim(), password)
export const signIn = (email, password) => signInWithEmailAndPassword(auth(), email.trim(), password)
export const logout = () => signOut(auth())
export const resetPassword = (email) => sendPasswordResetEmail(auth(), email.trim())

export async function setUserRestaurant(uid, code, name) {
  await set(ref(db(), `kp_users/${uid}`), { code, name: name || '', at: Date.now() })
}
export async function getUserRestaurant(uid) {
  const snap = await get(ref(db(), `kp_users/${uid}`))
  return snap.exists() ? snap.val() : null
}
