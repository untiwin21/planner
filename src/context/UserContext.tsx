'use client'
import { createContext, useContext } from 'react'
export const UserContext = createContext<string>('')
export const useUserId = () => useContext(UserContext)
