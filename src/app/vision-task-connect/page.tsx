'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function VisionTaskConnect(){
  const [message,setMessage]=useState('요일에 배치한 할 일만 연결합니다.'),[busy,setBusy]=useState(false)
  async function connect(){
    setBusy(true)
    try{
      const nonce=new URLSearchParams(location.search).get('nonce')
      if(!window.opener||!nonce||!/^[a-f0-9]{32}$/.test(nonce))throw new Error('비전보드에서 플래너 연결을 눌러 주세요.')
      if(!supabase)throw new Error('연결 설정을 확인하지 못했습니다.')
      const {data,error}=await supabase.auth.getSession();if(error||!data.session)throw new Error('Planner 로그인이 필요합니다.')
      const response=await fetch('/api/vision-tasks',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({op:'connect'})})
      const result=await response.json();if(!response.ok)throw new Error(result.error||'계정 연결에 실패했습니다.')
      window.opener.postMessage({type:'vision-tasks-connected',nonce,token:result.token,expiresAt:result.expiresAt},'https://vision-board-navy.vercel.app')
      setMessage('연결했습니다. 비전보드로 돌아가세요.')
    }catch(e){setMessage(e instanceof Error?e.message:'연결하지 못했습니다.')}
    finally{setBusy(false)}
  }
  return <main style={{maxWidth:520,margin:'10vh auto',padding:28,lineHeight:1.9}}><h1 style={{fontSize:26,fontWeight:600}}>Vision Plan 연결</h1><p>{message}</p><ul style={{paddingLeft:20,listStyle:'disc',margin:'20px 0'}}><li>제목·배치 날짜·완료 상태·기준일을 동기화합니다.</li><li>이 연결에서 만든 할 일만 읽고 수정합니다.</li><li>플래너 소유자 계정에서만 사용할 수 있습니다.</li><li>개인 일지·목표 달성 기준·다른 일정은 비전보드로 보내지 않습니다.</li><li>연결은 30일 후 만료되며 비전보드에서 해제할 수 있습니다.</li></ul><button disabled={busy} onClick={connect} style={{padding:'12px 24px',background:'#161616',color:'#fff',borderRadius:24}}>{busy?'연결 중…':'이 계정에 연결 허용'}</button><p style={{fontSize:13,color:'#666'}}>비전보드: vision-board-navy.vercel.app</p></main>
}
