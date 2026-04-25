import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const initializedRef = useRef(false)

  useEffect(() => {
    // 안전망: 10초 후에도 로딩 중이면 강제로 해제
    const safetyTimer = setTimeout(() => setLoading(false), 10000)

    // Supabase v2: onAuthStateChange는 구독 즉시 INITIAL_SESSION 이벤트를 발생시킴
    // getSession()을 별도로 호출하면 fetchProfile이 두 번 실행되는 경쟁 조건 발생 → 제거
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)

      if (u) {
        supabase
          .from('profiles')
          .select('*')
          .eq('id', u.id)
          .maybeSingle()          // 행이 없어도 406 대신 data: null 반환
          .then(async ({ data, error }) => {
            if (error) {
              console.error('[profiles] select error:', error)
              setProfile(null)
              return
            }
            if (data) {
              setProfile(data)
            } else {
              // 트리거 미실행 등으로 프로필 행이 없는 경우 직접 생성
              console.warn('[profiles] 행 없음 → 자동 생성 시도')
              const name = u.user_metadata?.name || u.email?.split('@')[0] || '사용자'
              const { data: created, error: insertError } = await supabase
                .from('profiles')
                .insert({ id: u.id, name })
                .select()
                .single()
              if (insertError) {
                console.error('[profiles] insert error:', insertError)
                setProfile(null)
              } else {
                setProfile(created)
              }
            }
          })
          .catch(err => {
            console.error('[profiles] unexpected error:', err)
            setProfile(null)
          })
          .finally(() => {
            clearTimeout(safetyTimer)
            setLoading(false)
          })
      } else {
        setProfile(null)
        clearTimeout(safetyTimer)
        setLoading(false)
      }
    })

    return () => {
      clearTimeout(safetyTimer)
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data ?? null)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUp(name, email, password) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function updateProfile(updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()
    if (error) throw error
    setProfile(data)
    return data
  }

  async function uploadAvatar(file) {
    const { error } = await supabase.storage
      .from('avatars')
      .upload(user.id, file, { upsert: true, contentType: file.type })
    if (error) throw error

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(user.id)

    const url = `${publicUrl}?t=${Date.now()}`
    await updateProfile({ avatar_url: url })
    return url
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      updateProfile,
      uploadAvatar,
      refreshProfile: () => user && fetchProfile(user.id),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
