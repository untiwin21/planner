'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function VisionConnect() {
  const [message,setMessage]=useState('Planner 로그인 상태를 확인하고 있습니다.')
  useEffect(()=>{
    let active=true
    async function connect(){
      try {
        const nonce=new URLSearchParams(location.search).get('nonce')
        if(!window.opener || !nonce || !/^[a-f0-9]{32}$/.test(nonce))throw new Error('비전보드에서 계정 연결을 눌러 주세요.')
        const {data}=await supabase!.auth.getSession()
        if(!data.session)throw new Error('먼저 아래 링크에서 Planner에 로그인한 뒤 다시 연결해 주세요.')
        const r=await fetch('/api/vision-weeks',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token}})
        if(!r.ok)throw new Error('계정 연결에 실패했습니다. Planner 로그인 상태를 확인해 주세요.')
        const result=await r.json()
        if(!active)return
        window.opener.postMessage({type:'vision-connected',nonce,token:result.token},'https://vision-board-navy.vercel.app')
        setMessage('연결했습니다. 비전보드로 돌아가면 됩니다.')
        window.close()
      } catch(e){if(active)setMessage(e instanceof Error?e.message:'연결하지 못했습니다.')}
    }
    connect();return()=>{active=false}
  },[])
  return <main style={{maxWidth:480,margin:'15vh auto',padding:32,fontFamily:'sans-serif',lineHeight:1.8}}><h1>비전보드 계정 연결</h1><p>{message}</p><p>주간 목표와 회고만 동기화합니다.</p><a href="/" target="_blank" rel="noopener noreferrer">Planner 열기</a><br/><button onClick={()=>location.reload()} style={{marginTop:20,padding:12}}>다시 연결</button></main>
}
