import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [activeUser, setActiveUser] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUsers()
    const savedUserId = localStorage.getItem('activeUserId')
    if (savedUserId) {
      supabase
        .from('users')
        .select('*')
        .eq('id', savedUserId)
        .single()
        .then(({ data }) => {
          if (data) setActiveUser(data)
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [])

  async function loadUsers() {
    const { data } = await supabase
      .from('users')
      .select('id, name, google_account_email, is_admin, created_at, password_hash')
      .order('name')
    setUsers((data ?? []).map(u => ({ ...u, has_password: u.password_hash !== null, password_hash: undefined })))
  }

  async function verifyPassword(userId, password) {
    const { data, error } = await supabase.rpc('verify_user_password', {
      p_user_id: userId,
      p_password: password,
    })
    if (error) throw error
    return data === true
  }

  function selectUser(user) {
    setActiveUser(user)
    localStorage.setItem('activeUserId', user.id)
  }

  function clearUser() {
    setActiveUser(null)
    localStorage.removeItem('activeUserId')
  }

  async function createUser(name, { isAdmin = false, email = '' } = {}) {
    const insert = { name }
    if (isAdmin) insert.is_admin = true
    if (email.trim()) insert.google_account_email = email.trim()
    const { data, error } = await supabase
      .from('users')
      .insert(insert)
      .select()
      .single()
    if (error) throw error
    setUsers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    return data
  }

  async function deleteUser(userId) {
    const { error } = await supabase.from('users').delete().eq('id', userId)
    if (error) throw error
    setUsers(prev => prev.filter(u => u.id !== userId))
  }

  const isAdmin = activeUser?.is_admin === true

  return (
    <UserContext.Provider value={{ activeUser, users, loading, isAdmin, selectUser, clearUser, createUser, deleteUser, loadUsers, verifyPassword }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
