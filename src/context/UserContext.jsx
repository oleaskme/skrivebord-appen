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
    const { data } = await supabase.from('users').select('*').order('name')
    setUsers(data ?? [])
  }

  function selectUser(user) {
    setActiveUser(user)
    localStorage.setItem('activeUserId', user.id)
  }

  function clearUser() {
    setActiveUser(null)
    localStorage.removeItem('activeUserId')
  }

  async function createUser(name) {
    const { data, error } = await supabase
      .from('users')
      .insert({ name })
      .select()
      .single()
    if (error) throw error
    setUsers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    return data
  }

  return (
    <UserContext.Provider value={{ activeUser, users, loading, selectUser, clearUser, createUser, loadUsers }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
