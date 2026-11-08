'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function VisionTaskConnect(){
  const [message,setMessage]=useState('Plan 기록을 이 계정에 저장하고 기기 간 연결합니다.'),[busy,setBusy]=useState(false)
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
  return <main style={{maxWidth:520,margin:'10vh auto',padding:28,lineHeight:1.9}}><h1 style={{fontSize:26,fontWeight:600}}>Vision Plan 연결</h1><p>{message}</p><ul style={{paddingLeft:20,listStyle:'disc',margin:'20px 0'}}><li>Plan 목표·달성 기준·월별/주간 계획·초안·세부 할 일·완료 기록을 계정에 저장합니다.</li><li>요일에 배치한 세부 할 일은 하루 4회 플래너에 동기화합니다.</li><li>플래너 소유자 계정에서만 사용할 수 있습니다.</li><li>개인 일지와 다른 일정은 비전보드로 보내지 않습니다.</li><li>연결은 기한 없이 유지되며 비전보드에서 언제든 해제할 수 있습니다.</li></ul><p style={{fontSize:13,marginBottom:20}}><a href="/" target="_blank" rel="noopener noreferrer" style={{textDecoration:"underline"}}>Planner 로그인 열기 ↗</a><br/>먼저 같은 브라우저에서 로그인한 뒤 이 화면으로 돌아와 연결을 허용하세요.</p><button disabled={busy} onClick={connect} style={{padding:'12px 24px',background:'#161616',color:'#fff',borderRadius:24}}>{busy?'연결 중…':'이 계정에 연결 허용'}</button><p style={{fontSize:13,color:'#666'}}>비전보드: vision-board-navy.vercel.app</p></main>
}
