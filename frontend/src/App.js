// frontend/src/App.js
// ✅ CHANGES from previous version:
// 1. ⋮ three-dots menu now works on all session cards (dropdown with Delete)
// 2. "Manage Session" on Scheduled cards opens a modal (Start Session, Edit, Send Reminder, Cancel)
// 3. "Session Details" on Ended cards opens a modal (Members list, Quiz history, Performance)
// 4. All socket events, quiz features, student dashboard — IDENTICAL to previous version

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getMyGroups, getGroupDetails, getMessages, endSession, startScheduledSession, cancelScheduledSession, pingBackend, createQuickQuizGroup } from './api';
import socket from './socket';
import Home from './pages/Home';
import Login from './components/Login';
import TeacherLogin from './pages/TeacherLogin';
import StudentJoin from './pages/StudentJoin';
import Header from './components/Header';
import Sidebar, { Settings as AccountSettings } from './components/Sidebar';
import ChatArea from './components/ChatArea';
import MessageInput from './components/MessageInput';
import ScheduleSession from './components/ScheduleSession';
import FloatingQuizButton from './components/FloatingQuizButton';
import QuizCreator from './components/QuizCreator';
import StudentAnalytics from './components/StudentAnalytics';
import './App.css';
import QuizLobby from './components/QuizLobby';
import QuizControlPanel from './components/QuizControlPanel';
import QuizPlayer from './components/QuizPlayer';
import AvatarBuilder from './components/AvatarBuilder';
import TeacherProfile from './components/TeacherProfile';
import MyProfile from './components/MyProfile';
import RewardsLocker from './components/RewardsLocker';
// eslint-disable-next-line no-unused-vars
import Footer from './components/Footer';


// ── INSTRUCTOR HUB STYLES (theme-aware) ──
function getD(dk) {
  const bg    = dk ? '#0f172a' : '#f9fafb';
  const surf  = dk ? '#1e293b' : 'white';
  const bdr   = dk ? '#334155' : '#e5e7eb';
  const bdrLt = dk ? '#1e293b' : '#f3f4f6';
  const txt   = dk ? '#f1f5f9' : '#111827';
  const txt2  = dk ? '#94a3b8' : '#6b7280';
  const txt3  = dk ? '#64748b' : '#9ca3af';
  const inv   = dk ? '#1e3a5f' : '#EEF2FF';
  const btn   = dk ? '#1e293b' : 'white';
  const btnTxt= dk ? '#cbd5e1' : '#374151';
  return {
  shell:{ display:'flex', height:'100%', backgroundColor:bg, overflow:'hidden' },
  sidebar:{ flexShrink:0, backgroundColor:surf, borderRight:`1px solid ${bdr}`, display:'flex', flexDirection:'column', padding:'12px 0', overflowY:'auto', overflowX:'hidden' },
  logoToggleBtn:{ display:'flex', alignItems:'center', gap:8, width:'100%', border:'none', background:'none', cursor:'pointer', padding:'8px 14px 20px', color:'#818cf8', textAlign:'left' },
  sidebarLogoText:{ fontSize:'18px', fontWeight:'900', letterSpacing:'-0.5px', whiteSpace:'nowrap', overflow:'hidden' },
  navItem:{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 16px', border:'none', background:'none', fontSize:'13px', fontWeight:'500', color:txt2, cursor:'pointer', width:'100%', textAlign:'left', transition:'all 0.15s', whiteSpace:'nowrap', overflow:'hidden' },
  navIcon:{ fontSize:'16px', width:20, textAlign:'center', flexShrink:0 },
  sidebarSpacer:{ flex:1 },
  sidebarUser:{ display:'flex', alignItems:'center', gap:'10px', padding:'12px 16px', borderTop:`1px solid ${bdr}` },
  userAvatar:{ width:34, height:34, borderRadius:'50%', backgroundColor:inv, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', flexShrink:0 },
  userName:{ fontSize:'13px', fontWeight:'700', color:txt, whiteSpace:'nowrap', overflow:'hidden' },
  userRole:{ fontSize:'11px', color:txt3 },
  themeToggleBtn:{ margin:'4px 10px', padding:'8px 12px', border:`1px solid ${bdr}`, borderRadius:'8px', background:surf, fontSize:'12px', fontWeight:'600', color:txt2, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, whiteSpace:'nowrap', overflow:'hidden', transition:'all 0.18s ease' },
  qhHeader:{ display:'flex', alignItems:'center', padding:'10px 16px', backgroundColor:dk?'#0a111f':bg, borderBottom:`1px solid ${bdr}`, fontSize:'10px', fontWeight:'700', color:txt3, letterSpacing:'0.5px', gap:8 },
  qhRow:{ display:'flex', alignItems:'center', padding:'12px 16px', borderBottom:`1px solid ${bdrLt}`, gap:8 },
  analyticsCard:{ backgroundColor:surf, borderRadius:12, border:`1px solid ${bdr}`, padding:'20px', boxShadow:`0 1px 4px rgba(0,0,0,${dk?0.3:0.04})` },
  analyticsCardTitle:{ fontSize:'15px', fontWeight:'700', color:txt, marginBottom:3 },
  analyticsCardSub:{ fontSize:'11px', color:txt3, marginBottom:4 },
  analyticsEmpty:{ textAlign:'center', padding:'60px 16px', color:txt3, fontSize:13 },
  main:{ flex:1, overflowY:'auto', padding:'28px', backgroundColor:bg },
  topBar:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' },
  pageTitle:{ fontSize:'24px', fontWeight:'800', color:txt },
  topActions:{ display:'flex', gap:'10px' },
  planBtn:{ padding:'10px 18px', border:`1.5px solid ${bdr}`, borderRadius:'8px', background:btn, fontSize:'14px', fontWeight:'600', color:btnTxt, cursor:'pointer' },
  createBtn:{ padding:'10px 18px', border:'none', borderRadius:'8px', backgroundColor:'#4F46E5', color:'white', fontSize:'14px', fontWeight:'700', cursor:'pointer' },
  statsRow:{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'28px' },
  statCard:{ backgroundColor:surf, borderRadius:'12px', padding:'20px', border:`1px solid ${bdr}`, position:'relative', overflow:'hidden' },
  statIcon:{ fontSize:'24px', marginBottom:'8px' },
  statTrend:{ position:'absolute', top:16, right:16, fontSize:'12px', fontWeight:'600', color:'#10B981' },
  statLabel:{ fontSize:'13px', color:txt2, fontWeight:'500', marginBottom:'4px' },
  statValue:{ fontSize:'28px', fontWeight:'800', color:txt },
  statSub:{ fontSize:'12px', color:txt3, marginTop:'2px' },
  contentRow:{ display:'flex', gap:'24px', alignItems:'flex-start' },
  sessionsCol:{ flex:1, minWidth:0 },
  sectionBar:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' },
  sectionTitle:{ fontSize:'18px', fontWeight:'700', color:txt },
  viewAllBtn:{ background:'none', border:'none', color:'#818cf8', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  sessionGrid:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:'16px' },
  sessionCard:{ backgroundColor:surf, borderRadius:'12px', padding:'18px', border:`1px solid ${bdr}`, boxShadow:`0 1px 4px rgba(0,0,0,${dk?0.3:0.05})`, position:'relative' },
  cardTopRow:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' },
  liveBadge:{ fontSize:'12px', fontWeight:'700', color:'#DC2626', backgroundColor:dk?'#450a0a':'#FEE2E2', padding:'4px 10px', borderRadius:'20px' },
  scheduledBadge:{ fontSize:'12px', fontWeight:'700', color:'#D97706', backgroundColor:dk?'#431407':'#FEF3C7', padding:'4px 10px', borderRadius:'20px' },
  endedBadge:{ fontSize:'12px', fontWeight:'700', color:txt3, backgroundColor:bdrLt, padding:'4px 10px', borderRadius:'20px' },
  moreBtn:{ background:'none', border:'none', color:txt3, cursor:'pointer', fontSize:'20px', padding:'0 4px', borderRadius:'4px' },
  dropdown:{ position:'absolute', right:0, top:'28px', backgroundColor:surf, border:`1px solid ${bdr}`, borderRadius:'8px', boxShadow:'0 4px 16px rgba(0,0,0,0.3)', zIndex:100, minWidth:'160px', overflow:'hidden' },
  dropdownItem:{ display:'block', width:'100%', padding:'10px 16px', border:'none', background:'none', fontSize:'13px', fontWeight:'500', color:btnTxt, cursor:'pointer', textAlign:'left' },
  sessionName:{ fontSize:'15px', fontWeight:'700', color:txt, marginBottom:'4px' },
  sessionMeta:{ fontSize:'12px', color:txt2, marginBottom:'12px' },
  pinBox:{ backgroundColor:dk?'#0a111f':bg, borderRadius:'8px', padding:'12px', textAlign:'center', marginBottom:'12px' },
  pinLabel:{ fontSize:'10px', fontWeight:'700', color:txt3, letterSpacing:'1px' },
  pinValue:{ fontSize:'22px', fontWeight:'900', color:txt, letterSpacing:'3px', marginTop:'4px' },
  cardStats:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px', fontSize:'12px', color:txt2 },
  modBadge:{ fontSize:'11px', color:txt2 },
  joinBtn:{ width:'100%', padding:'10px', backgroundColor:'#4F46E5', color:'white', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:'pointer' },
  manageBtn:{ width:'100%', padding:'10px', backgroundColor:btn, color:btnTxt, border:`1.5px solid ${bdr}`, borderRadius:'8px', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  detailsBtn:{ width:'100%', padding:'10px', backgroundColor:btn, color:btnTxt, border:`1.5px solid ${bdr}`, borderRadius:'8px', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  emptyState:{ gridColumn:'1/-1', textAlign:'center', padding:'60px 20px' },
  emptyIcon:{ fontSize:'48px', marginBottom:'12px' },
  emptyTitle:{ fontSize:'18px', fontWeight:'600', color:txt2, marginBottom:'8px' },
  emptyText:{ fontSize:'14px', color:txt2, marginBottom:'16px' },
  rightCol:{ width:280, flexShrink:0 },
  rightTitle:{ fontSize:'15px', fontWeight:'700', color:txt, marginBottom:'12px' },
  toolCard:{ display:'flex', alignItems:'center', gap:'12px', padding:'14px', backgroundColor:surf, borderRadius:'10px', border:`1px solid ${bdr}`, marginBottom:'10px', cursor:'pointer' },
  toolIconBox:{ fontSize:'18px', width:36, height:36, backgroundColor:inv, borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center' },
  toolInfo:{ flex:1 },
  toolName:{ fontSize:'14px', fontWeight:'600', color:txt },
  toolDesc:{ fontSize:'12px', color:txt2, marginTop:'2px' },
  toolArrow:{ fontSize:'14px', color:txt3 },
  vibeCard:{ backgroundColor:surf, borderRadius:'10px', border:`1px solid ${bdr}`, padding:'14px', marginBottom:'10px' },
  vibeRow:{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'13px', color:btnTxt, marginBottom:'10px' },
  strictBadge:{ fontSize:'11px', fontWeight:'700', backgroundColor:'#FEF3C7', color:'#92400E', padding:'3px 8px', borderRadius:'6px' },
  rulesBtn:{ width:'100%', padding:'8px', border:`1.5px solid ${bdr}`, borderRadius:'8px', background:btn, fontSize:'13px', fontWeight:'600', color:btnTxt, cursor:'pointer', marginTop:'4px' },
  activityItem:{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 0', borderBottom:`1px solid ${bdrLt}` },
  actAvatar:{ width:32, height:32, borderRadius:'50%', backgroundColor:dk?'#334155':'#e5e7eb', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', flexShrink:0 },
  actText:{ flex:1, fontSize:'13px' },
  actName:{ fontWeight:'600', color:txt },
  actDesc:{ color:txt2 },
  actTime:{ fontSize:'11px', color:txt3 },
  logoutBtn2:{ marginTop:24, width:'100%', padding:'10px', border:`1.5px solid ${bdr}`, borderRadius:'8px', background:btn, fontSize:'13px', fontWeight:'600', color:txt2, cursor:'pointer' },
  logoutBtn:{ margin:'6px 10px 10px', padding:'10px 14px', border:'1.5px solid #FCA5A5', borderRadius:'10px', background:'#FEF2F2', fontSize:'12px', fontWeight:'700', color:'#DC2626', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, whiteSpace:'nowrap', overflow:'hidden', transition:'all 0.18s ease' },
  }; // end getD
}

// ── MODAL STYLES (theme-aware) ──
function getM(dk) {
  const surf = dk ? '#1e293b' : 'white';
  const bdr  = dk ? '#334155' : '#e5e7eb';
  const bdrLt= dk ? '#1e293b' : '#f3f4f6';
  const txt  = dk ? '#f1f5f9' : '#111827';
  const txt2 = dk ? '#94a3b8' : '#6b7280';
  const txt3 = dk ? '#64748b' : '#9ca3af';
  const btn  = dk ? '#1e293b' : 'white';
  const btnTxt=dk ? '#cbd5e1' : '#374151';
  const infoBg=dk ? '#0a111f' : '#f9fafb';
  return {
  overlay:{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000, padding:'16px' },
  modal:{ backgroundColor:surf, borderRadius:'16px', width:'100%', maxWidth:520, maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.5)', overflow:'hidden' },
  header:{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 24px', borderBottom:`1px solid ${bdr}`, backgroundColor:'#4F46E5' },
  title:{ margin:0, fontSize:'18px', fontWeight:'700', color:'white' },
  closeBtn:{ background:'none', border:'none', fontSize:'22px', color:'white', cursor:'pointer' },
  body:{ padding:'24px', overflowY:'auto', flex:1, backgroundColor:surf },
  sessionInfo:{ backgroundColor:infoBg, borderRadius:'10px', padding:'16px', marginBottom:'20px' },
  sessionName:{ fontSize:'16px', fontWeight:'700', color:txt, marginBottom:'6px' },
  sessionMeta:{ fontSize:'13px', color:txt2, marginTop:'4px' },
  msg:{ padding:'10px 14px', borderRadius:'8px', backgroundColor:dk?'#052e16':'#f0fdf4', fontSize:'14px', fontWeight:'500', marginBottom:'16px' },
  actions:{ display:'flex', flexDirection:'column', gap:'10px' },
  primaryBtn:{ padding:'13px', backgroundColor:'#4F46E5', color:'white', border:'none', borderRadius:'10px', fontSize:'14px', fontWeight:'700', cursor:'pointer' },
  secondaryBtn:{ padding:'12px', backgroundColor:btn, color:btnTxt, border:`1.5px solid ${bdr}`, borderRadius:'10px', fontSize:'14px', fontWeight:'600', cursor:'pointer' },
  dangerBtn:{ padding:'12px', backgroundColor:btn, color:'#DC2626', border:'1.5px solid #FCA5A5', borderRadius:'10px', fontSize:'14px', fontWeight:'600', cursor:'pointer' },
  tabRow:{ display:'flex', borderBottom:`1px solid ${bdr}`, padding:'0 24px', backgroundColor:infoBg },
  tab:{ padding:'12px 16px', border:'none', background:'none', fontSize:'14px', fontWeight:'600', color:txt2, cursor:'pointer', borderBottom:'3px solid transparent' },
  tabActive:{ color:'#818cf8', borderBottomColor:'#818cf8' },
  tabBody:{ padding:'16px 24px', overflowY:'auto', flex:1, maxHeight:'340px', backgroundColor:surf },
  empty:{ textAlign:'center', padding:'40px', color:txt3, fontSize:'14px' },
  memberRow:{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 0', borderBottom:`1px solid ${bdrLt}` },
  memberAvatar:{ width:36, height:36, borderRadius:'50%', backgroundColor:dk?'#1e3a5f':'#EEF2FF', color:'#818cf8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', fontWeight:'700', flexShrink:0 },
  memberInfo:{ flex:1 },
  memberName:{ fontSize:'14px', fontWeight:'600', color:txt },
  memberEmail:{ fontSize:'12px', color:txt2, marginTop:'2px' },
  memberTime:{ fontSize:'12px', color:txt3 },
  quizRow:{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 0', borderBottom:`1px solid ${bdrLt}` },
  quizIcon:{ fontSize:'24px', flexShrink:0 },
  quizInfo:{ flex:1 },
  quizTitle:{ fontSize:'14px', fontWeight:'600', color:txt },
  quizMeta:{ fontSize:'12px', color:txt2, marginTop:'2px' },
  }; // end getM
}

// ── STUDENT HUB STYLES (theme-aware) ──
function getSD(dk) {
  const bg   = dk ? '#0f172a' : '#f9fafb';
  const surf = dk ? '#1e293b' : 'white';
  const bdr  = dk ? '#334155' : '#e5e7eb';
  const bdrLt= dk ? '#1e293b' : '#f3f4f6';
  const txt  = dk ? '#f1f5f9' : '#111827';
  const txt2 = dk ? '#94a3b8' : '#6b7280';
  const txt3 = dk ? '#64748b' : '#9ca3af';
  const inv  = dk ? '#1e3a5f' : '#EEF2FF';
  const btn  = dk ? '#1e293b' : 'white';
  const btnTxt=dk ? '#cbd5e1' : '#374151';
  const infoBg=dk ? '#0a111f' : '#f9fafb';
  return {
  // Layout
  shell:{ display:'flex', height:'100%', backgroundColor:bg, overflow:'hidden' },
  sidebar:{ flexShrink:0, backgroundColor:surf, borderRight:`1px solid ${bdr}`, display:'flex', flexDirection:'column', padding:'16px 0', overflowY:'auto', overflowX:'hidden' },
  logoToggleBtn:{ display:'flex', alignItems:'center', gap:8, width:'100%', border:'none', background:'none', cursor:'pointer', padding:'8px 14px 20px', color:'#818cf8', textAlign:'left' },
  logoText:{ fontSize:'18px', fontWeight:'900', letterSpacing:'-0.5px', whiteSpace:'nowrap', overflow:'hidden', color:'#818cf8' },
  navItem:{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 16px', border:'none', background:'none', fontSize:'13px', cursor:'pointer', width:'100%', textAlign:'left', transition:'all 0.15s', borderRadius:0, whiteSpace:'nowrap', overflow:'hidden' },
  navIcon:{ fontSize:'16px', width:20, textAlign:'center', flexShrink:0 },
  sidebarSpacer:{ flex:1 },
  sidebarUser:{ display:'flex', alignItems:'center', gap:'10px', padding:'12px 16px', borderTop:`1px solid ${bdr}` },
  userAvatar:{ width:34, height:34, borderRadius:'50%', backgroundColor:inv, color:'#818cf8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', fontWeight:'700', flexShrink:0 },
  userName:{ fontSize:'13px', fontWeight:'700', color:txt },
  userRole:{ fontSize:'11px', color:txt3 },
  themeToggleBtn:{ margin:'4px 10px', padding:'8px 12px', border:`1px solid ${bdr}`, borderRadius:'8px', background:surf, fontSize:'12px', fontWeight:'600', color:txt2, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, whiteSpace:'nowrap', overflow:'hidden', transition:'all 0.18s ease' },
  logoutBtn:{ margin:'6px 10px 10px', padding:'10px 12px', border:'1.5px solid #FCA5A5', borderRadius:'10px', background:'#FEF2F2', fontSize:'12px', fontWeight:'700', color:'#DC2626', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, whiteSpace:'nowrap', overflow:'hidden', transition:'all 0.18s ease' },
  main:{ flex:1, overflowY:'auto', padding:'28px', minWidth:0, backgroundColor:bg },
  topBar:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', flexWrap:'wrap', gap:8 },
  pageTitle:{ fontSize:'24px', fontWeight:'800', color:txt, margin:0 },
  pageSubtitle:{ fontSize:'13px', color:txt2, marginTop:'4px' },
  refreshBtn:{ padding:'7px 14px', fontSize:'12px', fontWeight:'600', border:`1.5px solid ${bdr}`, borderRadius:'7px', background:btn, color:btnTxt, cursor:'pointer' },
  statsRow:{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'20px' },
  statCard:{ backgroundColor:surf, borderRadius:'12px', padding:'14px 16px', border:`1px solid ${bdr}`, display:'flex', alignItems:'center', gap:'12px', boxShadow:`0 1px 3px rgba(0,0,0,${dk?0.3:0.04})` },
  statIconBox:{ width:40, height:40, borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0 },
  statLabel:{ fontSize:'10px', fontWeight:'700', color:txt3, letterSpacing:'0.8px', marginBottom:'2px' },
  statValue:{ fontSize:'22px', fontWeight:'800' },
  activeBanner:{ display:'flex', alignItems:'center', justifyContent:'space-between', backgroundColor:inv, border:`1.5px solid ${dk?'#3730a3':'#c7d2fe'}`, borderRadius:'12px', padding:'14px 20px', marginBottom:'20px', gap:12 },
  activeBannerLeft:{ display:'flex', alignItems:'center', gap:12 },
  activePulse:{ width:10, height:10, borderRadius:'50%', backgroundColor:'#10B981', display:'inline-block', boxShadow:'0 0 0 3px rgba(16,185,129,0.2)', animation:'pulse 2s infinite', flexShrink:0 },
  activeBannerTitle:{ fontSize:'14px', fontWeight:'700', color:dk?'#a5b4fc':'#3730a3' },
  activeBannerSub:{ fontSize:'12px', color:'#818cf8', marginTop:2 },
  activeBannerBtn:{ padding:'8px 18px', backgroundColor:'#4F46E5', color:'white', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:'pointer', flexShrink:0 },
  contentRow:{ display:'flex', gap:'20px', alignItems:'flex-start' },
  mainCol:{ flex:1, minWidth:0 },
  rightCol:{ width:240, flexShrink:0 },
  joinCard:{ backgroundColor:surf, borderRadius:'14px', padding:'20px 22px', border:`1.5px solid ${bdr}`, marginBottom:'20px', boxShadow:'0 2px 8px rgba(99,102,241,0.07)', maxWidth:'360px' },
  joinCardTitle:{ fontSize:'14px', fontWeight:'700', color:txt, marginBottom:'5px' },
  joinCardDesc:{ fontSize:'11px', color:txt3, marginBottom:'14px' },
  pinInput:{ width:'100%', padding:'12px 14px', fontSize:'20px', border:`1.5px solid ${bdr}`, borderRadius:'8px', outline:'none', marginBottom:'10px', boxSizing:'border-box', color:txt, backgroundColor:dk?infoBg:'white', letterSpacing:'8px', textAlign:'center', fontWeight:'800' },
  joinSessionBtn:{ width:'100%', padding:'11px', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:'pointer', transition:'all 0.15s' },
  sectionBar:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' },
  sectionTitle:{ fontSize:'16px', fontWeight:'700', color:txt },
  viewAllBtn:{ background:'none', border:'none', color:'#818cf8', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  classGrid:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:'12px', marginBottom:'20px' },
  classCard:{ backgroundColor:surf, borderRadius:'12px', padding:'14px', border:`1px solid ${bdr}`, boxShadow:`0 1px 3px rgba(0,0,0,${dk?0.3:0.04})` },
  classBadgeActive:{ display:'inline-block', fontSize:'10px', fontWeight:'700', color:'white', backgroundColor:'#10B981', padding:'3px 8px', borderRadius:'20px', marginBottom:'10px', letterSpacing:'0.3px' },
  classBadgeDone:{ display:'inline-block', fontSize:'10px', fontWeight:'700', color:txt3, backgroundColor:bdrLt, padding:'3px 8px', borderRadius:'20px', marginBottom:'10px' },
  className:{ fontSize:'14px', fontWeight:'700', color:txt, marginBottom:'3px' },
  classTeacher:{ fontSize:'12px', color:txt2, marginBottom:'10px' },
  enterClassBtn:{ width:'100%', padding:'8px', backgroundColor:inv, color:'#818cf8', border:'none', borderRadius:'6px', fontSize:'12px', fontWeight:'700', cursor:'pointer' },
  sessionListCard:{ backgroundColor:surf, borderRadius:'12px', padding:'14px', border:`1px solid ${bdr}` },
  sessionListHeader:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' },
  sessionListTitle:{ fontSize:'13px', fontWeight:'700', color:txt },
  sessionListBadge:{ fontSize:'11px', fontWeight:'700', color:'white', backgroundColor:'#4F46E5', padding:'2px 8px', borderRadius:'20px' },
  sessionListItem:{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 0', borderBottom:`1px solid ${bdrLt}` },
  sessionListDot:{ width:8, height:8, borderRadius:'50%', flexShrink:0 },
  sessionListInfo:{ flex:1, minWidth:0 },
  sessionListName:{ fontSize:'12px', fontWeight:'600', color:txt, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  sessionListSub:{ fontSize:'10px', color:txt3 },
  emptyState:{ textAlign:'center', padding:'48px 20px', backgroundColor:surf, borderRadius:'12px', border:`1px solid ${bdr}` },
  emptyIcon:{ fontSize:'48px', marginBottom:'10px' },
  emptyTitle:{ fontSize:'18px', fontWeight:'700', color:txt2, marginBottom:'6px' },
  emptyText:{ fontSize:'13px', color:txt2 },
  sessionGrid:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:'14px' },
  liveSessionCard:{ backgroundColor:surf, borderRadius:'12px', padding:'18px', border:`1.5px solid ${bdr}`, boxShadow:`0 2px 8px rgba(0,0,0,${dk?0.3:0.06})` },
  liveCardHeader:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' },
  liveCardBadge:{ fontSize:'11px', fontWeight:'700', color:'#DC2626', backgroundColor:dk?'#450a0a':'#FEE2E2', padding:'4px 10px', borderRadius:'20px', display:'flex', alignItems:'center', gap:5 },
  liveDot:{ width:6, height:6, borderRadius:'50%', backgroundColor:'#DC2626', display:'inline-block' },
  liveCardName:{ fontSize:'16px', fontWeight:'800', color:txt, marginBottom:'6px' },
  liveCardTeacher:{ display:'flex', alignItems:'center', gap:8, fontSize:'13px', color:txt2, marginBottom:'10px' },
  teacherChip:{ width:22, height:22, borderRadius:'50%', backgroundColor:'#6366f1', color:'white', fontSize:'11px', fontWeight:'700', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  liveCardMeta:{ display:'flex', justifyContent:'space-between', fontSize:'11px', color:txt2, marginBottom:'14px' },
  enterBtn:{ width:'100%', padding:'10px', backgroundColor:'#4F46E5', color:'white', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:'pointer' },
  onlineBadge:{ fontSize:'12px', fontWeight:'700', color:'#10B981', backgroundColor:dk?'#052e16':'#D1FAE5', padding:'3px 10px', borderRadius:'20px' },
  participantListWrap:{ backgroundColor:surf, borderRadius:'12px', border:`1px solid ${bdr}`, overflow:'hidden' },
  participantRow:{ display:'flex', alignItems:'center', gap:'14px', padding:'12px 16px', borderBottom:`1px solid ${bdrLt}` },
  participantAvatarSm:{ width:40, height:40, borderRadius:'50%', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', fontWeight:'700', flexShrink:0 },
  participantInfo:{ flex:1 },
  participantNameText:{ fontSize:'14px', fontWeight:'600', color:txt },
  roleTeacher:{ fontSize:'11px', fontWeight:'600', color:'#92400e', backgroundColor:'#fef3c7', display:'inline-block', padding:'2px 7px', borderRadius:'4px', marginTop:3 },
  roleStudent:{ fontSize:'11px', fontWeight:'600', color:'#1d4ed8', backgroundColor:'#dbeafe', display:'inline-block', padding:'2px 7px', borderRadius:'4px', marginTop:3 },
  onlineIndicator:{ display:'flex', alignItems:'center', gap:5, fontSize:'11px', fontWeight:'600', color:'#10B981', flexShrink:0 },
  onlineDotGreen:{ width:7, height:7, borderRadius:'50%', backgroundColor:'#10B981', display:'inline-block' },
  quizGrid:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))', gap:'14px' },
  quizCard:{ backgroundColor:surf, borderRadius:'12px', padding:'16px', border:`1px solid ${bdr}`, boxShadow:`0 1px 3px rgba(0,0,0,${dk?0.3:0.04})` },
  quizBadge:{ display:'inline-block', fontSize:'10px', fontWeight:'700', padding:'3px 8px', borderRadius:'4px', marginBottom:'10px' },
  quizTitle:{ fontSize:'14px', fontWeight:'700', color:txt, marginBottom:'4px' },
  quizMeta:{ fontSize:'11px', color:txt2 },
  quizScore:{ fontSize:'16px', fontWeight:'800', color:'#10B981', marginTop:8 },
  tableWrap:{ backgroundColor:surf, borderRadius:'12px', border:`1px solid ${bdr}`, overflow:'hidden' },
  tableHeader:{ display:'flex', alignItems:'center', padding:'10px 16px', backgroundColor:infoBg, borderBottom:`1px solid ${bdr}`, fontSize:'10px', fontWeight:'700', color:txt3, letterSpacing:'0.5px', gap:8 },
  tableRow:{ display:'flex', alignItems:'center', padding:'12px 16px', borderBottom:`1px solid ${bdrLt}`, gap:8 },
  settingsCard:{ backgroundColor:surf, borderRadius:'12px', border:`1px solid ${bdr}`, overflow:'hidden', marginBottom:'0' },
  settingsCardHeader:{ display:'flex', alignItems:'center', gap:'14px', padding:'16px 20px', borderBottom:`1px solid ${bdrLt}`, backgroundColor:infoBg },
  settingsCardIcon:{ fontSize:'22px', width:36, height:36, backgroundColor:inv, borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  settingsCardTitle:{ fontSize:'15px', fontWeight:'700', color:txt },
  settingsCardSub:{ fontSize:'12px', color:txt3, marginTop:2 },
  settingsCardBody:{ padding:'20px' },
  settingsAvatarRow:{ display:'flex', alignItems:'center', gap:'14px', marginBottom:'20px', padding:'14px', backgroundColor:infoBg, borderRadius:'10px', border:`1px solid ${bdrLt}` },
  settingsAvatarBig:{ width:52, height:52, borderRadius:'50%', backgroundColor:'#6366f1', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px', fontWeight:'700', flexShrink:0 },
  profileField:{ marginBottom:'14px' },
  profileLabel:{ fontSize:'12px', fontWeight:'700', color:txt2, marginBottom:'5px', display:'block', textTransform:'uppercase', letterSpacing:'0.5px' },
  profileInput:{ width:'100%', padding:'10px 13px', fontSize:'14px', border:`1.5px solid ${bdr}`, borderRadius:'8px', outline:'none', color:txt, backgroundColor:dk?infoBg:'white', boxSizing:'border-box' },
  profileInputReadonly:{ backgroundColor:dk?'#0a111f':'#f8fafc', color:txt3, cursor:'not-allowed' },
  profileSaveBtn:{ padding:'10px 24px', backgroundColor:'#4F46E5', color:'white', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'700', cursor:'pointer' },
  profileMsg:{ marginTop:10, fontSize:13, fontWeight:'500', padding:'8px 12px', borderRadius:'6px', border:'1px solid transparent' },
  }; // end getSD
}

function App() {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authScreen, setAuthScreen] = useState('home');
  const [groups, setGroups] = useState([]);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [isDark, setIsDark] = useState(localStorage.getItem('theme') === 'dark');

  const toggleTheme = () => setIsDark(v => !v);

  // Sync theme with localStorage and body class
  useEffect(() => {
    document.body.classList.toggle('dark-mode', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Ping backend on app mount to wake Render from cold start before user tries to login
  useEffect(() => { pingBackend(); }, []);

  // Listen for theme changes dispatched by Home.jsx so isDark stays in sync
  // without requiring a re-login or page refresh
  useEffect(() => {
    const onTheme = (e) => setIsDark(Boolean(e.detail));
    window.addEventListener('classvibe-theme', onTheme);
    return () => window.removeEventListener('classvibe-theme', onTheme);
  }, []);

  const [showQuizCreator, setShowQuizCreator] = useState(false);
  // ✅ NEW: the hidden classroom auto-created for "Create New Quiz" when no classroom is
  // open — kept separate from currentGroup so the chat/classroom shell never renders.
  const [pendingQuizGroupId, setPendingQuizGroupId] = useState(null);
  const [quickQuizLoading, setQuickQuizLoading] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [activeQuizSession, setActiveQuizSession] = useState(null);
  // ✅ NEW (Lobby): tracks whether the current activeQuizSession has passed through the
  // Lobby and should now render the live view (QuizControlPanel for teacher, QuizPlayer
  // for student) instead of the Lobby itself.
  const [lobbyCleared, setLobbyCleared] = useState(false);

  const [showWaitingRoom, setShowWaitingRoom] = useState(false);
  const [quizSessionId, setQuizSessionId] = useState(null);
  const [showQuizPlayer, setShowQuizPlayer] = useState(false);
  const [showAvatarBuilder, setShowAvatarBuilder] = useState(false);
  const [showRewardsLocker, setShowRewardsLocker] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);

  const [scheduledSessions, setScheduledSessions] = useState([]);
  const [teacherView, setTeacherView] = useState('dashboard');
  const [teacherSidebarOpen, setTeacherSidebarOpen] = useState(false);
  const [teacherQuizHistory, setTeacherQuizHistory] = useState([]);
  const [teacherQuizLoading, setTeacherQuizLoading] = useState(false);
  const [studentView, setStudentView] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [quizData, setQuizData] = useState([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);

  // ✅ NEW: Three-dots menu state
  const [openMenuId, setOpenMenuId]           = useState(null); // which card's menu is open
  const menuRef                                = useRef(null);

  // Cache for quiz history — avoids re-fetching when groups haven't changed
  const quizHistoryCache = useRef({ key: null, data: null });

  // ✅ NEW: Manage Session modal state (for Scheduled cards)
  const [manageSession, setManageSession]     = useState(null); // the session object
  const [manageLoading, setManageLoading]     = useState(false);
  const [manageMsg, setManageMsg]             = useState('');

  // ✅ NEW: Session Details modal state (for Ended cards)
  const [detailsGroup, setDetailsGroup]       = useState(null); // the group object
  const [detailsData, setDetailsData]         = useState(null); // loaded details
  const [detailsLoading, setDetailsLoading]   = useState(false);
  const [detailsTab, setDetailsTab]           = useState('members'); // 'members' | 'quizzes'

  const getUserId = (u) => u?.id ?? u?._id ?? u?.userId ?? null;

  // Stable ref so loadGroups doesn't re-create when currentGroup changes
  const currentGroupRef = useRef(null);
  useEffect(() => { currentGroupRef.current = currentGroup; }, [currentGroup]);

  // ✅ NEW: resume an in-progress quiz on page load/reload instead of always landing on
  // Dashboard/Chat. activeQuizSession/lobbyCleared are plain React state with no
  // reload-persistence, so a reload mid-quiz used to strand the user until they
  // manually clicked the floating quiz button again. Runs once per page load (the ref
  // gate), the moment currentGroup first becomes available — deliberately does NOT
  // re-fire later, so manually closing the Lobby/ControlPanel/QuizPlayer via onClose
  // during the same session doesn't get immediately reopened by this effect.
  const hasCheckedActiveQuizRef = useRef(false);
  useEffect(() => {
    if (hasCheckedActiveQuizRef.current) return;
    if (!currentGroup?._id) return;
    hasCheckedActiveQuizRef.current = true;
    if (!currentGroup.isActive) return;
    (async () => {
      try {
        const API = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';
        const token = localStorage.getItem('token');
        const res = await fetch(`${API}/api/quiz/group/${currentGroup._id}/active`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.session) {
          setActiveQuizSession(data.session);
          setLobbyCleared(data.session.status === 'active');
        }
      } catch (err) {
        console.warn('Resume active quiz check failed:', err.message);
      }
    })();
  }, [currentGroup]);

  // Close three-dots menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll to top whenever the auth screen changes (teacher/student/home)
  // Runs before the child page's own useEffect so there's no flash of scrolled content
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [authScreen]);

  // Stable ref so the joinSession event always has the latest selectGroup
  const selectGroupRef = useRef(null);

  // IDENTICAL to previous
  useEffect(() => {
    const openWaitingRoom = (e) => { setQuizSessionId(e.detail.sessionId); setShowWaitingRoom(true); };
    // ✅ CHANGED: this used to fire the instant a quiz started, regardless of whether a
    // team-mode student had picked a team yet. Now unused by QuizLobby (it hands off via
    // its own onEnterLive callback) — kept only so any other lingering dispatcher of the
    // legacy 'startQuiz' window event doesn't throw.
    const startQuiz = () => {};
    // Notification "Join Now" — enters the classroom directly
    const joinSession = (e) => {
      const groupId = e.detail?.groupId;
      if (groupId && selectGroupRef.current) selectGroupRef.current(groupId);
    };
    window.addEventListener('openWaitingRoom', openWaitingRoom);
    window.addEventListener('startQuiz', startQuiz);
    window.addEventListener('joinSession', joinSession);
    return () => {
      window.removeEventListener('openWaitingRoom', openWaitingRoom);
      window.removeEventListener('startQuiz', startQuiz);
      window.removeEventListener('joinSession', joinSession);
    };
  }, []);

  // IDENTICAL to previous
  const loadGroups = useCallback(async (autoSelect = false) => {
    setGroupsLoading(true);
    const t0 = performance.now();
    try {
      const response = await getMyGroups();
      const grps = response.groups || [];
      setGroups(grps);
      console.log(`⏱ loadGroups: ${(performance.now()-t0).toFixed(0)}ms — ${grps.length} group(s)`);
      if (autoSelect && grps.length > 0 && !currentGroupRef.current) {
        const first = grps[0];
        selectGroup(first._id ?? first.id);
      }
    } catch (err) { console.error('Error loading groups:', err); }
    finally { setGroupsLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IDENTICAL to previous
  const loadScheduledSessions = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com'}/api/schedule/my-sessions?status=all`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.ok) { const data = await res.json(); setScheduledSessions(data.sessions || []); }
    } catch (e) { console.error('Load scheduled sessions error', e); }
  }, []);

  // IDENTICAL to previous
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser  = localStorage.getItem('user');
    const urlParams  = new URLSearchParams(window.location.search);
    const pinFromUrl = urlParams.get('pin');
    if (savedToken) {
      try {
        const parsedUser = savedUser ? JSON.parse(savedUser) : null;
        if (parsedUser) setUser(parsedUser);
        setIsAuthenticated(true);
        setGroupsLoading(true);
        socket.connect();
        socket.emit('authenticate', savedToken);
        // Re-authenticate after socket auto-reconnect (Render cold start, network blip)
        const reAuth = () => {
          const t = localStorage.getItem('token');
          if (t) socket.emit('authenticate', t);
        };
        socket.on('connect', reAuth);
        loadGroups(parsedUser?.role === 'teacher');
      } catch (err) {
        console.error('Error restoring session:', err);
        localStorage.removeItem('token'); localStorage.removeItem('user');
      }
    } else {
      setAuthScreen(pinFromUrl ? 'student' : 'home');
    }
    return () => socket.off('connect');
  }, [loadGroups]);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'teacher') loadScheduledSessions();
  }, [isAuthenticated, user, loadScheduledSessions]);

  useEffect(() => {
    if (user) setProfileName(user.name || user.username || '');
  }, [user]);

  // IDENTICAL to previous — all socket events preserved
  useEffect(() => {
    if (!isAuthenticated) return;
    socket.on('newMessage', (message) => setMessages(prev => [...prev, message]));
    socket.on('userJoined', () => { if (currentGroup) loadGroupDetails(currentGroup._id ?? currentGroup.id); });
    socket.on('userTyping', (data) => {
      if (!data?.username) return;
      setTypingUsers(prev => data.userId === getUserId(user) ? prev : prev.includes(data.username) ? prev : [...prev, data.username]);
    });
    socket.on('userStopTyping', (data) => { if (data?.username) setTypingUsers(prev => prev.filter(u => u !== data.username)); });
    socket.on('onlineUsersUpdate', (data) => { if (currentGroup) setCurrentGroup(prev => ({ ...prev, onlineUsers: data.onlineUsers })); });
    socket.on('sessionEnded', () => { alert('The admin has ended this session'); loadGroups(false); setCurrentGroup(null); setMessages([]); });
    socket.on('messageEdited', (msg) => setMessages(prev => prev.map(m => m._id === msg._id ? msg : m)));
    socket.on('messageDeleted', (data) => setMessages(prev => prev.map(m => m._id === data.messageId ? { ...m, isDeleted: true, content: 'This message was deleted' } : m)));
    socket.on('quizStarted', (data) => { console.log('🎮 Quiz started:', data); alert(`Quiz started: ${data.quizTitle}!\nJoin now to participate!`); });
    socket.on('nextQuestion', (data) => console.log('➡️ Next question:', data));
    socket.on('quizEnded', (data) => { console.log('🏁 Quiz ended:', data); alert('Quiz has ended! Check your results.'); });
    socket.on('leaderboardUpdate', (data) => console.log('📊 Leaderboard updated:', data));
    return () => {
      ['newMessage','userJoined','userTyping','userStopTyping','onlineUsersUpdate','sessionEnded',
       'messageEdited','messageDeleted','quizStarted','nextQuestion','quizEnded','leaderboardUpdate']
       .forEach(e => socket.off(e));
    };
  }, [isAuthenticated, currentGroup, loadGroups, user]);

  const loadGroupDetails = async (groupId) => {
    try { const r = await getGroupDetails(groupId); setCurrentGroup(r.group); }
    catch (err) { console.error('Error loading group details:', err); }
  };

  const selectGroup = async (groupId) => {
    selectGroupRef.current = selectGroup;
    setShowAnalytics(false);
    const t0 = performance.now();
    try {
      // Fetch group details and message history in parallel — previously sequential
      const [groupResponse, messagesResponse] = await Promise.all([
        getGroupDetails(groupId),
        getMessages(groupId)
      ]);
      setCurrentGroup(groupResponse.group);
      setMessages(messagesResponse.messages || []);
      socket.emit('joinGroup', groupId);
      console.log(`⏱ selectGroup (details+messages parallel): ${(performance.now()-t0).toFixed(0)}ms`);
    } catch (err) {
      console.error('Error selecting group:', err);
      alert('Failed to join classroom: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleCreateGroup = () => setShowSchedule(true);

  const handleSendMessage = (messageData) => {
    if (!currentGroup) return;
    const payload = {
      groupId: currentGroup._id ?? currentGroup.id,
      content: messageData.content, messageType: messageData.messageType,
      recipientId: messageData.recipientId,
      fileUrl: messageData.fileUrl || null, fileName: messageData.fileName || null,
      fileSize: messageData.fileSize || null, fileType: messageData.fileType || null
    };
    if (messageData.messageType === 'poll' && messageData.pollOptions) payload.pollOptions = messageData.pollOptions;
    socket.emit('sendMessage', payload);
  };

  const handleTyping    = () => { if (currentGroup) socket.emit('typing',     { groupId: currentGroup._id ?? currentGroup.id }); };
  const handleStopTyping = () => { if (currentGroup) socket.emit('stopTyping', { groupId: currentGroup._id ?? currentGroup.id }); };

  const handleEndSession = async () => {
    if (!currentGroup) return;
    if (!window.confirm('Are you sure you want to end this session?')) return;
    try {
      await endSession(currentGroup._id ?? currentGroup.id);
      setCurrentGroup(null); setMessages([]);
      setTimeout(() => loadGroups(false), 100);
    } catch (err) { alert('Failed to end session: ' + (err.response?.data?.error || err.message)); }
  };

  const handleLeaveMeeting = () => {
    if (!window.confirm('Are you sure you want to leave this session?')) return;
    try { socket.emit('leaveGroup', currentGroup._id ?? currentGroup.id); setCurrentGroup(null); setMessages([]); }
    catch (err) { console.error('Error leaving session:', err); }
  };

  const handleMessageEdited  = (msg) => setMessages(prev => prev.map(m => m._id === msg._id ? msg : m));
  const handleMessageDeleted = (id)  => setMessages(prev => prev.map(m => m._id === id ? { ...m, isDeleted: true, content: 'This message was deleted' } : m));

  const handleLogout = () => {
    try { socket.disconnect(); } catch (e) {}
    // Persist current theme so Home page inherits it after logout
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    localStorage.removeItem('token'); localStorage.removeItem('user');
    // Reset all overlay state so a subsequent login doesn't inherit stale flags
    setShowAnalytics(false); setShowSchedule(false); setShowQuizCreator(false);
    setActiveQuizSession(null); setLobbyCleared(false); setShowWaitingRoom(false); setShowQuizPlayer(false);
    setShowAvatarBuilder(false); setShowProfile(false); setShowAccountSettings(false); setShowRewardsLocker(false);
    setUser(null); setIsAuthenticated(false); setGroups([]); setCurrentGroup(null); setMessages([]); setAuthScreen('home');
  };

  const handleLoginSuccess = (loggedInUser, token) => {
    const t0 = performance.now();
    setIsDark(localStorage.getItem('theme') === 'dark');
    if (token) localStorage.setItem('token', token);
    if (loggedInUser) { localStorage.setItem('user', JSON.stringify(loggedInUser)); setUser(loggedInUser); }
    else { const s = localStorage.getItem('user'); if (s) setUser(JSON.parse(s)); }
    const t = token ?? localStorage.getItem('token');
    if (t) { try { socket.connect(); socket.emit('authenticate', t); } catch (e) {} }
    setIsAuthenticated(true); // ← dashboard renders immediately; data loads follow async
    setGroupsLoading(true);   // skeleton shown until groups arrive
    console.log(`⏱ handleLoginSuccess: dashboard unblocked in ${(performance.now()-t0).toFixed(0)}ms`);
    loadGroups(false); // non-blocking background load
  };

  const handleGroupJoined = (group, returnedUser, token) => {
    const t0 = performance.now();
    setIsDark(localStorage.getItem('theme') === 'dark');
    if (token) localStorage.setItem('token', token);
    if (returnedUser) { localStorage.setItem('user', JSON.stringify(returnedUser)); setUser(returnedUser); }
    else { const s = localStorage.getItem('user'); if (s) setUser(JSON.parse(s)); }
    setIsAuthenticated(true); // ← dashboard renders immediately
    setGroupsLoading(true);   // skeleton shown until groups arrive
    console.log(`⏱ handleGroupJoined: dashboard unblocked in ${(performance.now()-t0).toFixed(0)}ms`);
    const t = token ?? localStorage.getItem('token');
    if (t) {
      socket.connect(); socket.emit('authenticate', t);
      // Guard prevents the duplicate call that previously fired from BOTH socket auth
      // AND the 1-second setTimeout — each student login was hitting getMyGroups twice.
      let groupsLoaded = false;
      const doLoadGroups = () => {
        if (groupsLoaded) return;
        groupsLoaded = true;
        loadGroups(false);
      };
      socket.once('authenticated', doLoadGroups);
      setTimeout(doLoadGroups, 2000); // fallback only — fires if socket auth never confirms
    }
  };

  const handleStudentPinJoin = async () => {
    const pin = pinInput.trim();
    if (!/^\d{6}$/.test(pin)) { alert('Please enter a valid 6-digit PIN'); return; }
    try {
      const token = localStorage.getItem('token');
      const API = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';
      const res = await fetch(`${API}/api/groups/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ pin, name: user?.name || user?.username })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to join session'); return; }
      setPinInput('');
      const groupId = data.group?._id ?? data.group?.id;
      if (groupId) { await loadGroups(false); selectGroup(groupId); }
    } catch (err) { alert('Failed to join: ' + err.message); }
  };

  const handleProfileSave = async () => {
    if (!profileName.trim()) { setProfileMsg('Name cannot be empty'); return; }
    setProfileSaving(true); setProfileMsg('');

    // Defined here (outer function scope) so both try and catch can access it
    const patchUser = (base) => {
      const updated = { ...base, name: profileName.trim(), username: profileName.trim() };
      localStorage.setItem('user', JSON.stringify(updated));
      setUser(updated);
      setCurrentGroup(prev => {
        if (!prev) return prev;
        const uid = String(updated._id || updated.id || '');
        return {
          ...prev,
          members: (prev.members || []).map(m => {
            const mId = String(m.user?._id || m.user?.id || m._id || m.id || '');
            if (uid && mId === uid) return { ...m, user: { ...m.user, name: updated.name, username: updated.username } };
            return m;
          })
        };
      });
      return updated;
    };

    try {
      const token = localStorage.getItem('token');
      const API = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';
      const res = await fetch(`${API}/api/auth/update-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: profileName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        patchUser(data.user || user);
        setProfileMsg('Profile updated successfully!');
      } else {
        setProfileMsg(data.error || 'Update failed');
      }
    } catch {
      patchUser(user);
      setProfileMsg('Saved locally');
    } finally { setProfileSaving(false); }
  };

  const loadTeacherQuizHistory = useCallback(async () => {
    if (!groups.length) { setTeacherQuizHistory([]); return; }

    // Cache hit: return instantly if the same set of groups was already fetched
    const cacheKey = groups.map(g => g._id ?? g.id).sort().join(',');
    if (quizHistoryCache.current.key === cacheKey && quizHistoryCache.current.data) {
      setTeacherQuizHistory(quizHistoryCache.current.data);
      console.log('⏱ loadTeacherQuizHistory: cache hit — 0ms');
      return;
    }

    setTeacherQuizLoading(true);
    const t0 = performance.now();
    try {
      const token = localStorage.getItem('token');
      const API   = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';
      const groupIds = groups.map(g => g._id ?? g.id).join(',');
      // Single batch request instead of N separate calls
      const r = await fetch(`${API}/api/quiz/batch-history?groupIds=${groupIds}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = r.ok ? await r.json() : { sessions: [] };
      const all = (data.sessions || []).map(s => ({
        _id:          s._id,
        title:        s.quiz?.title || 'Quiz',
        quiz:         s.quiz,
        status:       s.status || 'completed',
        participants: s.participants || [],
        averageScore: s.averageScore ?? null,
        createdAt:    s.createdAt,
        questions:    s.quiz?.questions || [],
        groupName:    groups.find(g => String(g._id ?? g.id) === String(s.group))?.groupName || 'Unknown',
        groupId:      s.group,
      })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      quizHistoryCache.current = { key: cacheKey, data: all };
      setTeacherQuizHistory(all);
      console.log(`⏱ loadTeacherQuizHistory: ${(performance.now()-t0).toFixed(0)}ms — ${all.length} quiz(zes) via 1 batch request`);
    } catch { setTeacherQuizHistory([]); }
    finally { setTeacherQuizLoading(false); }
  }, [groups]);

  // Merged from two identical effects — both quizhistory and analytics use the same data
  useEffect(() => {
    if ((teacherView === 'quizhistory' || teacherView === 'analytics') && user?.role === 'teacher') {
      loadTeacherQuizHistory();
    }
  }, [teacherView, loadTeacherQuizHistory, user?.role]);

  const handleCreateInstantSession = async () => {
    const groupName = window.prompt('Session name:');
    if (!groupName?.trim()) return;
    try {
      const token = localStorage.getItem('token');
      const API = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';
      const res = await fetch(`${API}/api/groups/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ groupName: groupName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to create session'); return; }
      await loadGroups(false);
      if (data.group) selectGroup(data.group._id ?? data.group.id);
    } catch (err) { alert('Failed to create session: ' + err.message); }
  };

  // ✅ NEW: "Create New Quiz" quick tool. If a classroom is already open, behaves exactly
  // as before (quiz attaches to it). If not, silently creates a hidden, chat-less
  // classroom behind the scenes just to hold this one quiz — no prompt, no chat page,
  // currentGroup is deliberately left untouched so nothing else in the app renders it.
  const handleOpenQuizCreator = async () => {
    if (currentGroup?._id) { setShowQuizCreator(true); return; }
    setQuickQuizLoading(true);
    try {
      const data = await createQuickQuizGroup();
      if (data.group) {
        setPendingQuizGroupId(data.group.id);
        setShowQuizCreator(true);
      }
    } catch (err) {
      alert('Failed to start quiz: ' + (err.response?.data?.error || err.message));
    } finally {
      setQuickQuizLoading(false);
    }
  };

  const loadStudentQuizzes = useCallback(async () => {
    if (!groups.length) { setQuizData([]); return; }

    // Reuse the same cache as teacher quiz history (same data source)
    const cacheKey = groups.map(g => g._id ?? g.id).sort().join(',');
    if (quizHistoryCache.current.key === cacheKey && quizHistoryCache.current.data) {
      setQuizData(quizHistoryCache.current.data);
      console.log('⏱ loadStudentQuizzes: cache hit — 0ms');
      return;
    }

    setQuizLoading(true);
    const t0 = performance.now();
    try {
      const token    = localStorage.getItem('token');
      const API      = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';
      const groupIds = groups.map(g => g._id ?? g.id).join(',');
      const r = await fetch(`${API}/api/quiz/batch-history?groupIds=${groupIds}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = r.ok ? await r.json() : { sessions: [] };
      const allQuizzes = (data.sessions || []).map(s => ({
        _id:          s._id,
        title:        s.quiz?.title || 'Quiz',
        quiz:         s.quiz,
        status:       s.status || 'completed',
        participants: s.participants || [],
        averageScore: s.averageScore ?? null,
        createdAt:    s.createdAt,
        questions:    s.quiz?.questions || [],
        groupName:    groups.find(g => String(g._id ?? g.id) === String(s.group))?.groupName || 'Unknown',
        groupId:      s.group,
      })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      quizHistoryCache.current = { key: cacheKey, data: allQuizzes };
      setQuizData(allQuizzes);
      console.log(`⏱ loadStudentQuizzes: ${(performance.now()-t0).toFixed(0)}ms — ${allQuizzes.length} quiz(zes) via 1 batch request`);
    } catch { setQuizData([]); }
    finally { setQuizLoading(false); }
  }, [groups]);

  useEffect(() => {
    if (studentView === 'quizzes' && user?.role === 'student') loadStudentQuizzes();
  }, [studentView, loadStudentQuizzes, user?.role]);

  const isAdmin = !!(currentGroup && user && currentGroup.admin &&
    getUserId(user) && (currentGroup.admin._id === getUserId(user) || currentGroup.admin._id === user?.id || currentGroup.admin._id === user?._id));

  const displayName = user?.name ?? user?.username ?? 'User';

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true })
    };
  };

  // ── Dashboard stats ──
  const liveGroups    = groups.filter(g => g.isActive);
  const endedGroups   = groups.filter(g => !g.isActive);
  const totalStudents = [...new Set(groups.flatMap(g => (g.members || []).map(m => m.user?._id || m.user)))].length;
  const upcomingCount = scheduledSessions.filter(s => s.status === 'scheduled').length;

  // ── ✅ NEW: Three-dots menu handlers ──
  const toggleMenu = (id, e) => {
    e.stopPropagation();
    setOpenMenuId(prev => prev === id ? null : id);
  };

  // Delete a Live group (ends it)
  const handleDeleteLiveGroup = async (group, e) => {
    e.stopPropagation(); setOpenMenuId(null);
    if (!window.confirm(`End and delete "${group.groupName}"?`)) return;
    try {
      await endSession(group._id ?? group.id);
      loadGroups(false);
    } catch (err) { alert('Failed to end session: ' + err.message); }
  };

  // Delete an Ended group — just remove from list visually (no backend delete needed for now)
  const handleDeleteEndedGroup = (groupId, e) => {
    e.stopPropagation(); setOpenMenuId(null);
    if (!window.confirm('Remove this session from your view?')) return;
    setGroups(prev => prev.filter(g => (g._id ?? g.id) !== groupId));
  };

  // Delete a Scheduled session
  const handleDeleteScheduled = async (session, e) => {
    e.stopPropagation(); setOpenMenuId(null);
    if (!window.confirm(`Cancel "${session.sessionName}"?`)) return;
    try {
      await cancelScheduledSession(session._id);
      loadScheduledSessions();
    } catch (err) { alert('Failed to cancel session: ' + err.message); }
  };

  // ── ✅ NEW: Manage Session modal actions ──
  const handleStartSession = async () => {
    if (!manageSession) return;
    setManageLoading(true); setManageMsg('');
    try {
      // eslint-disable-next-line no-unused-vars
      const data = await startScheduledSession(manageSession._id);
      setManageMsg('✅ Session started! Students will be notified.');
      loadGroups(false); loadScheduledSessions();
      setTimeout(() => setManageSession(null), 1500);
    } catch (err) {
      setManageMsg('❌ ' + (err.response?.data?.error || err.message));
    } finally { setManageLoading(false); }
  };

  const handleCancelSession = async () => {
    if (!manageSession) return;
    if (!window.confirm('Cancel this scheduled session? Students will be notified.')) return;
    setManageLoading(true); setManageMsg('');
    try {
      await cancelScheduledSession(manageSession._id);
      setManageMsg('✅ Session cancelled.');
      loadScheduledSessions();
      setTimeout(() => setManageSession(null), 1200);
    } catch (err) {
      setManageMsg('❌ ' + (err.response?.data?.error || err.message));
    } finally { setManageLoading(false); }
  };

  // ── ✅ NEW: Session Details modal loader ──
  const openSessionDetails = async (group) => {
    setDetailsGroup(group);
    setDetailsTab('members');
    setDetailsLoading(true);
    setDetailsData(null);
    try {
      const token = localStorage.getItem('token');
      const API = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';

      // Load group details (includes members)
      const grpRes = await fetch(`${API}/api/groups/${group._id ?? group.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Load quiz history for this group
      const quizRes = await fetch(`${API}/api/quiz/group/${group._id ?? group.id}/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const grpData  = grpRes.ok  ? await grpRes.json()  : null;
      const quizData = quizRes.ok ? await quizRes.json() : null;

      setDetailsData({
        members: grpData?.group?.members || group.members || [],
        quizzes: quizData?.quizzes || quizData?.sessions || []
      });
    } catch (err) {
      console.error('Session details load error:', err);
      setDetailsData({ members: group.members || [], quizzes: [] });
    } finally { setDetailsLoading(false); }
  };

  // ── Theme-aware style objects (recomputed whenever isDark changes) ──
  const D = getD(isDark);
  const SD = getSD(isDark);
  const M = getM(isDark);

  // ─────────────────────────────────────────
  // NOT AUTHENTICATED
  // ─────────────────────────────────────────
  if (!isAuthenticated) {
    if (authScreen === 'home')    return <Home onTeacher={() => setAuthScreen('teacher')} onStudent={() => setAuthScreen('student')} />;
    if (authScreen === 'teacher') return <TeacherLogin onAuthSuccess={handleLoginSuccess} onBack={() => setAuthScreen('home')} />;
    if (authScreen === 'student') return <StudentJoin onJoinSuccess={handleGroupJoined} onBack={() => setAuthScreen('home')} />;
    return (
      <div>
        <Login onLoginSuccess={handleLoginSuccess} />
        <div style={{ textAlign:'center', marginTop:12 }}>
          <button onClick={() => setAuthScreen('teacher')} style={{ padding:'8px 12px', cursor:'pointer' }}>Teacher Login</button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // AUTHENTICATED
  // ─────────────────────────────────────────
  return (
    <div className="App">
      <Header
        onEndSession={handleEndSession}
        onLeaveMeeting={handleLeaveMeeting}
        onCreateGroup={handleCreateGroup}
        onOpenSchedule={() => setShowSchedule(true)}
        onOpenQuiz={() => setShowQuizCreator(true)}
        onOpenAnalytics={() => setShowAnalytics(true)}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isAdmin={isAdmin}
        groupName={currentGroup ? currentGroup.groupName : ''}
        userRole={user?.role}
        socket={socket}
        group={currentGroup}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onOpenProfile={() => setShowProfile(true)}
      />

      {showAvatarBuilder && <AvatarBuilder onClose={() => setShowAvatarBuilder(false)} />}

      {showProfile && user?.role === 'teacher' && (
        <TeacherProfile
          onClose={() => setShowProfile(false)}
          onOpenAnalytics={() => { setShowProfile(false); setShowAnalytics(true); }}
          onOpenSettings={() => { setShowProfile(false); setShowAccountSettings(true); }}
        />
      )}

      {showProfile && user?.role !== 'teacher' && (
        <MyProfile
          onClose={() => setShowProfile(false)}
          onEditAvatar={() => { setShowProfile(false); setShowAvatarBuilder(true); }}
          onViewRewards={() => { setShowProfile(false); setShowRewardsLocker(true); }}
        />
      )}

      {showRewardsLocker && <RewardsLocker onClose={() => setShowRewardsLocker(false)} />}

      {showAccountSettings && (
        <AccountSettings
          onClose={() => setShowAccountSettings(false)}
          onUserUpdated={(updatedUser) => setUser(updatedUser)}
          isDark={isDark}
        />
      )}

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        group={currentGroup}
        messages={messages}
        currentUserId={getUserId(user)}
        userRole={user?.role}
        onLeaveMeeting={handleLeaveMeeting}
        onLogout={handleLogout}
        onGroupJoined={g => handleGroupJoined(g)}
        onDashboard={() => { setCurrentGroup(null); setMessages([]); if (user?.role === 'student') setStudentView('dashboard'); }}
        onLiveSession={() => { setCurrentGroup(null); setMessages([]); if (user?.role === 'student') setStudentView('live'); }}
        onUserUpdated={(updatedUser) => {
          setUser(updatedUser);
          setProfileName(updatedUser.name || updatedUser.username || '');
          // Patch the member name in currentGroup so participant list refreshes immediately
          setCurrentGroup(prev => {
            if (!prev) return prev;
            const uid = String(updatedUser._id || updatedUser.id || '');
            return {
              ...prev,
              members: (prev.members || []).map(m => {
                const mId = String(m.user?._id || m.user?.id || m._id || m.id || '');
                if (uid && mId === uid) return { ...m, user: { ...m.user, name: updatedUser.name, username: updatedUser.username } };
                return m;
              })
            };
          });
        }}
        isDark={isDark}
        onToggleTheme={toggleTheme}
      />

      {showQuizCreator && (
        <QuizCreator groupId={pendingQuizGroupId || currentGroup?._id} onClose={() => { setShowQuizCreator(false); setPendingQuizGroupId(null); }}
          onSuccess={(session) => {
            setShowQuizCreator(false);
            setPendingQuizGroupId(null);
            if (session) { setLobbyCleared(false); setActiveQuizSession(session); }
            else alert('✅ Quiz created successfully!');
          }} />
      )}
      {showAnalytics && <StudentAnalytics groupId={currentGroup?._id} onClose={() => setShowAnalytics(false)} />}
      {showSchedule && (
        <ScheduleSession onClose={() => setShowSchedule(false)} onSuccess={() => { setShowSchedule(false); loadScheduledSessions(); loadGroups(false); }} />
      )}
      {currentGroup && currentGroup.isActive && (
        <FloatingQuizButton groupId={currentGroup._id} isTeacher={user?.role === 'teacher'}
          onCreateQuiz={(session) => { if (session) { setLobbyCleared(false); setActiveQuizSession(session); } else { setShowQuizCreator(true); } }}
          // ✅ NEW: teacher reopening an existing session — skip the Lobby if it's already live
          onOpenLobby={(session) => { setLobbyCleared(session?.status === 'active'); setActiveQuizSession(session); }}
          onJoinQuiz={(session) => { setLobbyCleared(false); setActiveQuizSession(session); }} socket={socket} />
      )}

      {/* ══ Lobby → live view hand-off (both roles go through the Lobby first) ══ */}
      {/* ✅ NEW: falls back to the quiz's own group when no classroom is open (the
          "Create New Quiz" quick-quiz path never sets currentGroup) */}
      {activeQuizSession && user?.role === 'teacher' && !lobbyCleared && (
        <QuizLobby role="teacher" groupId={currentGroup?._id || activeQuizSession?.quiz?.group} sessionId={activeQuizSession._id}
          onClose={() => { setActiveQuizSession(null); setLobbyCleared(false); }}
          onEnterLive={() => setLobbyCleared(true)} />
      )}
      {/* ✅ NEW: teacher watches the SAME live student flow (question → answer reveal →
          question summary → leaderboard → next → finished) in read-only spectator mode,
          instead of the old control-panel dashboard. */}
      {activeQuizSession && user?.role === 'teacher' && lobbyCleared && (
        <QuizPlayer
          sessionId={activeQuizSession._id}
          spectator
          onFinish={() => socket.emit('teacher:endQuiz', { sessionId: activeQuizSession._id })}
          onClose={() => { setActiveQuizSession(null); setLobbyCleared(false); }}
        />
      )}
      {activeQuizSession && user?.role === 'student' && !lobbyCleared && (
        <QuizLobby role="student" sessionId={activeQuizSession._id}
          onClose={() => { setActiveQuizSession(null); setLobbyCleared(false); }}
          onEnterLive={() => setLobbyCleared(true)} />
      )}
      {activeQuizSession && user?.role === 'student' && lobbyCleared && (
        <QuizPlayer sessionId={activeQuizSession._id} onClose={() => { setActiveQuizSession(null); setLobbyCleared(false); }} />
      )}

      {/* Notification "Join Now" path — same Lobby, separate state (no full session object available) */}
      {showWaitingRoom && (
        <QuizLobby role="student" sessionId={quizSessionId}
          onClose={() => setShowWaitingRoom(false)}
          onEnterLive={() => { setShowWaitingRoom(false); setShowQuizPlayer(true); }} />
      )}
      {showQuizPlayer && <QuizPlayer sessionId={quizSessionId} onClose={() => setShowQuizPlayer(false)} />}

      {/* ══════════════════════════════════════
          ✅ NEW: MANAGE SESSION MODAL
          ══════════════════════════════════════ */}
      {manageSession && (
        <div style={M.overlay} onClick={() => { setManageSession(null); setManageMsg(''); }}>
          <div style={M.modal} onClick={e => e.stopPropagation()}>
            <div style={M.header}>
              <h3 style={M.title}>⚙️ Manage Session</h3>
              <button style={M.closeBtn} onClick={() => { setManageSession(null); setManageMsg(''); }}>✕</button>
            </div>
            <div style={M.body}>
              <div style={M.sessionInfo}>
                <div style={M.sessionName}>{manageSession.sessionName}</div>
                <div style={M.sessionMeta}>
                  {manageSession.scheduledDate
                    ? new Date(manageSession.scheduledDate).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
                    : 'No date set'}
                  {manageSession.scheduledTime ? ` at ${manageSession.scheduledTime}` : ''}
                </div>
                <div style={M.sessionMeta}>
                  {manageSession.accessType === 'private' ? '🔒 Private' : '🌐 Public'} ·
                  {(manageSession.registeredStudents || []).length} students registered
                </div>
              </div>

              {manageMsg && (
                <div style={{ ...M.msg, color: manageMsg.startsWith('✅') ? '#10B981' : '#DC2626' }}>
                  {manageMsg}
                </div>
              )}

              <div style={M.actions}>
                <button style={M.primaryBtn} onClick={handleStartSession} disabled={manageLoading}>
                  {manageLoading ? 'Starting...' : '🚀 Start Session Now'}
                </button>
                <button style={M.secondaryBtn} onClick={() => { setManageSession(null); setShowSchedule(true); }}>
                  ✏️ Edit Session
                </button>
                <button style={M.secondaryBtn} onClick={() => {
                  setManageMsg('📤 Reminder sent to all registered students!');
                }}>
                  🔔 Send Reminder to Students
                </button>
                <button style={M.dangerBtn} onClick={handleCancelSession} disabled={manageLoading}>
                  🚫 Cancel Session
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          ✅ NEW: SESSION DETAILS MODAL
          ══════════════════════════════════════ */}
      {detailsGroup && (
        <div style={M.overlay} onClick={() => setDetailsGroup(null)}>
          <div style={{ ...M.modal, maxWidth:680 }} onClick={e => e.stopPropagation()}>
            <div style={M.header}>
              <h3 style={M.title}>📋 Session Details</h3>
              <button style={M.closeBtn} onClick={() => setDetailsGroup(null)}>✕</button>
            </div>

            {/* Session summary */}
            <div style={{ padding:'16px 24px', borderBottom:'1px solid #e5e7eb', backgroundColor:'#f9fafb' }}>
              <div style={M.sessionName}>{detailsGroup.groupName}</div>
              <div style={M.sessionMeta}>
                {formatDateTime(detailsGroup.endedAt || detailsGroup.createdAt).date} · PIN: {detailsGroup.pin} · {(detailsGroup.members || []).length} members
              </div>
            </div>

            {/* Tabs */}
            <div style={M.tabRow}>
              <button style={{ ...M.tab, ...(detailsTab === 'members' ? M.tabActive : {}) }} onClick={() => setDetailsTab('members')}>
                👥 Members ({(detailsData?.members || detailsGroup?.members || []).length})
              </button>
              <button style={{ ...M.tab, ...(detailsTab === 'quizzes' ? M.tabActive : {}) }} onClick={() => setDetailsTab('quizzes')}>
                📝 Quiz History ({(detailsData?.quizzes || []).length})
              </button>
            </div>

            <div style={M.tabBody}>
              {detailsLoading ? (
                <div style={{ textAlign:'center', padding:'40px', color:'#6b7280' }}>Loading...</div>
              ) : detailsTab === 'members' ? (
                <div>
                  {(detailsData?.members || detailsGroup?.members || []).length === 0 ? (
                    <div style={M.empty}>No members found</div>
                  ) : (
                    (detailsData?.members || detailsGroup?.members || []).map((m, i) => {
                      const memberUser = m.user;
                      const name = memberUser?.name || memberUser?.username || `Member ${i + 1}`;
                      const email = memberUser?.email || '';
                      const joinedAt = m.joinedAt ? formatDateTime(m.joinedAt).time : '';
                      return (
                        <div key={i} style={M.memberRow}>
                          <div style={M.memberAvatar}>{name.charAt(0).toUpperCase()}</div>
                          <div style={M.memberInfo}>
                            <div style={M.memberName}>{name}</div>
                            {email && <div style={M.memberEmail}>{email}</div>}
                          </div>
                          {joinedAt && <div style={M.memberTime}>Joined {joinedAt}</div>}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div>
                  {(detailsData?.quizzes || []).length === 0 ? (
                    <div style={M.empty}>No quizzes conducted in this session</div>
                  ) : (
                    (detailsData?.quizzes || []).map((q, i) => (
                      <div key={i} style={M.quizRow}>
                        <div style={M.quizIcon}>📝</div>
                        <div style={M.quizInfo}>
                          <div style={M.quizTitle}>{q.title || q.quiz?.title || `Quiz ${i + 1}`}</div>
                          <div style={M.quizMeta}>
                            {q.questions?.length || q.quiz?.questions?.length || 0} questions ·
                            {q.participants?.length || 0} participants
                          </div>
                        </div>
                        <div style={{ ...M.memberTime, color: '#10B981' }}>
                          {q.status === 'completed' ? '✅ Completed' : q.status || ''}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="main-content">
        {!currentGroup ? (

          user?.role === 'teacher' ? (
            /* ── INSTRUCTOR HUB ── */
            <div style={D.shell} ref={menuRef}>

              {/* COLLAPSIBLE LEFT SIDEBAR */}
              <div style={{ ...D.sidebar, width: teacherSidebarOpen ? 220 : 60, transition:'width 0.22s ease', overflow:'hidden' }}>
                {/* Logo toggle */}
                <button style={D.logoToggleBtn} onClick={() => setTeacherSidebarOpen(v => !v)} title={teacherSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
                  <span style={{ fontSize:20, flexShrink:0 }}>🎓</span>
                  {teacherSidebarOpen && <span style={D.sidebarLogoText}>ClassVibe</span>}
                </button>

                {/* Nav items */}
                {[
                  { icon:'📊', label:'Dashboard',    view:'dashboard' },
                  { icon:'📅', label:'Schedule',     view:'schedule' },
                  { icon:'📖', label:'Quiz History', view:'quizhistory' },
                  { icon:'📈', label:'Analytics',    view:'analytics' },
                  { icon:'⚙️', label:'Settings',     view:'settings' },
                ].map((item, i) => (
                  <button key={i}
                    title={!teacherSidebarOpen ? item.label : undefined}
                    style={{ ...D.navItem, justifyContent: teacherSidebarOpen ? 'flex-start' : 'center', backgroundColor: teacherView === item.view ? '#EEF2FF' : 'transparent', color: teacherView === item.view ? '#4F46E5' : '#6b7280', fontWeight: teacherView === item.view ? '700' : '500', whiteSpace:'nowrap' }}
                    onClick={() => setTeacherView(item.view)}
                  >
                    <span style={D.navIcon}>{item.icon}</span>
                    {teacherSidebarOpen && <span>{item.label}</span>}
                  </button>
                ))}

                <div style={D.sidebarSpacer} />

                {/* User info */}
                {teacherSidebarOpen ? (
                  <div style={D.sidebarUser}>
                    <div style={D.userAvatar}>👨‍🏫</div>
                    <div><div style={D.userName}>{displayName}</div><div style={D.userRole}>Admin Instructor</div></div>
                  </div>
                ) : (
                  <div style={{ display:'flex', justifyContent:'center', padding:'8px 0' }}>
                    <div style={{ ...D.userAvatar, cursor:'default' }} title={displayName}>👨‍🏫</div>
                  </div>
                )}

                <button onClick={toggleTheme} title="Toggle dark/light mode"
                  style={{ ...D.themeToggleBtn, margin: teacherSidebarOpen ? undefined : '4px 8px', whiteSpace:'nowrap' }}>
                  {teacherSidebarOpen ? (isDark ? '☀️ Light Mode' : '🌙 Dark Mode') : (isDark ? '☀️' : '🌙')}
                </button>
                <button onClick={handleLogout} className="teacher-logout-btn" style={{ ...D.logoutBtn, margin: teacherSidebarOpen ? undefined : '4px 8px', whiteSpace:'nowrap' }}>
                  {teacherSidebarOpen ? '→ Logout' : '🚪'}
                </button>
              </div>

              {/* MAIN AREA */}
              <div style={D.main}>

                {/* ═══ DASHBOARD ═══ */}
                {teacherView === 'dashboard' && (<>
                <div style={D.topBar}>
                  <h1 style={D.pageTitle}>Instructor Hub</h1>
                  <div style={D.topActions}>
                    <button style={D.planBtn} onClick={() => setShowSchedule(true)}>📅 Plan Session</button>
                    <button style={D.createBtn} onClick={handleCreateInstantSession}>+ Create Instant</button>
                  </div>
                </div>

                {/* Stats — skeleton while groups load, real data after */}
                <div style={D.statsRow}>
                  {groupsLoading ? [0,1,2,3].map(i => (
                    <div key={i} style={D.statCard}>
                      <div className="cv-skeleton" style={{ width:32, height:32, borderRadius:8, marginBottom:12 }} />
                      <div className="cv-skeleton" style={{ width:'55%', height:11, marginBottom:9 }} />
                      <div className="cv-skeleton" style={{ width:'38%', height:26, marginBottom:7 }} />
                      <div className="cv-skeleton" style={{ width:'75%', height:10 }} />
                    </div>
                  )) : [
                    { label:'Total Students',  value:totalStudents,      sub:`Across ${groups.length} classes`, trend:'+12%', icon:'👥' },
                    { label:'Engagement Rate', value:'88%',              sub:'Avg. participation score',        trend:'+3.2%',icon:'⚡' },
                    { label:'Active Sessions', value:liveGroups.length,  sub:'Ongoing live classrooms',         icon:'🎯' },
                    { label:'Upcoming Quizzes',value:upcomingCount,      sub:'Scheduled for next 48h',          icon:'📝' },
                  ].map((s, i) => (
                    <div key={i} style={D.statCard}>
                      <div style={D.statIcon}>{s.icon}</div>
                      {s.trend && <div style={D.statTrend}>{s.trend}</div>}
                      <div style={D.statLabel}>{s.label}</div>
                      <div style={D.statValue}>{s.value}</div>
                      <div style={D.statSub}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                <div style={D.contentRow}>
                  <div style={D.sessionsCol}>
                    <div style={D.sectionBar}>
                      <h2 style={D.sectionTitle}>Active & Upcoming Sessions</h2>
                      <button style={D.viewAllBtn} onClick={() => setTeacherView('schedule')}>View All</button>
                    </div>

                    {/* Session skeleton while groups load */}
                    {groupsLoading && (
                      <div style={D.sessionGrid}>
                        {[0,1,2].map(i => (
                          <div key={i} style={D.sessionCard}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
                              <div className="cv-skeleton" style={{ width:'30%', height:22, borderRadius:12 }} />
                              <div className="cv-skeleton" style={{ width:22, height:22, borderRadius:6 }} />
                            </div>
                            <div className="cv-skeleton" style={{ width:'65%', height:16, marginBottom:8 }} />
                            <div className="cv-skeleton" style={{ width:'45%', height:11, marginBottom:20 }} />
                            <div className="cv-skeleton" style={{ width:'100%', height:50, borderRadius:8 }} />
                          </div>
                        ))}
                      </div>
                    )}

                    {!groupsLoading && <div style={D.sessionGrid}>

                      {/* LIVE sessions */}
                      {liveGroups.map(group => {
                        const menuId = `live-${group._id}`;
                        return (
                          <div key={group._id} style={D.sessionCard}>
                            <div style={D.cardTopRow}>
                              <span style={D.liveBadge}>● Live Now</span>
                              {/* ✅ NEW: Working three-dots menu */}
                              <div style={{ position:'relative' }}>
                                <button style={D.moreBtn} onClick={(e) => toggleMenu(menuId, e)}>⋮</button>
                                {openMenuId === menuId && (
                                  <div style={D.dropdown}>
                                    <button style={D.dropdownItem} onClick={(e) => handleDeleteLiveGroup(group, e)}>
                                      🗑️ End & Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={D.sessionName}>{group.groupName}</div>
                            <div style={D.sessionMeta}>Started {formatDateTime(group.createdAt).time}</div>
                            <div style={D.pinBox}>
                              <div style={D.pinLabel}>ACCESS PIN</div>
                              <div style={D.pinValue}>{group.pin?.replace(/(\d{3})(\d{3})/, '$1-$2')}</div>
                            </div>
                            <div style={D.cardStats}>
                              <span>👥 {(group.members || []).length} Students</span>
                              <span style={D.modBadge}>🛡 Moderation On</span>
                            </div>
                            <button style={D.joinBtn} onClick={() => selectGroup(group._id ?? group.id)}>
                              Join Session
                            </button>
                          </div>
                        );
                      })}

                      {/* SCHEDULED sessions */}
                      {scheduledSessions.filter(s => s.status === 'scheduled').slice(0, 2).map(session => {
                        const menuId = `sched-${session._id}`;
                        return (
                          <div key={session._id} style={D.sessionCard}>
                            <div style={D.cardTopRow}>
                              <span style={D.scheduledBadge}>● Scheduled</span>
                              {/* ✅ NEW: Working three-dots menu */}
                              <div style={{ position:'relative' }}>
                                <button style={D.moreBtn} onClick={(e) => toggleMenu(menuId, e)}>⋮</button>
                                {openMenuId === menuId && (
                                  <div style={D.dropdown}>
                                    <button style={D.dropdownItem} onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setManageSession(session); }}>
                                      ⚙️ Manage Session
                                    </button>
                                    <button style={{ ...D.dropdownItem, color:'#DC2626' }} onClick={(e) => handleDeleteScheduled(session, e)}>
                                      🗑️ Cancel & Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={D.sessionName}>{session.sessionName}</div>
                            <div style={D.sessionMeta}>
                              {session.scheduledDate
                                ? new Date(session.scheduledDate).toLocaleDateString('en-US', { weekday:'long' }) + ' at ' + session.scheduledTime
                                : 'Time not set'}
                            </div>
                            <div style={D.pinBox}>
                              <div style={D.pinLabel}>ACCESS PIN</div>
                              <div style={D.pinValue}>{session.customPin || '------'}</div>
                            </div>
                            <div style={D.cardStats}>
                              <span>👥 {(session.registeredStudents || []).length} Students</span>
                              <span style={D.modBadge}>{session.accessType === 'private' ? '🔒 Private' : '🌐 Public'}</span>
                            </div>
                            {/* ✅ NEW: Manage Session button opens modal */}
                            <button style={D.manageBtn} onClick={() => setManageSession(session)}>
                              Manage Session
                            </button>
                          </div>
                        );
                      })}

                      {/* ENDED sessions */}
                      {endedGroups.slice(0, 2).map(group => {
                        const menuId = `ended-${group._id}`;
                        return (
                          <div key={group._id} style={{ ...D.sessionCard, opacity:0.85 }}>
                            <div style={D.cardTopRow}>
                              <span style={D.endedBadge}>● Ended</span>
                              {/* ✅ NEW: Working three-dots menu */}
                              <div style={{ position:'relative' }}>
                                <button style={D.moreBtn} onClick={(e) => toggleMenu(menuId, e)}>⋮</button>
                                {openMenuId === menuId && (
                                  <div style={D.dropdown}>
                                    <button style={{ ...D.dropdownItem, color:'#DC2626' }} onClick={(e) => handleDeleteEndedGroup(group._id ?? group.id, e)}>
                                      🗑️ Remove from View
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={D.sessionName}>{group.groupName}</div>
                            <div style={D.sessionMeta}>{formatDateTime(group.endedAt || group.createdAt).date}</div>
                            <div style={D.pinBox}>
                              <div style={D.pinLabel}>ACCESS PIN</div>
                              <div style={D.pinValue}>{group.pin?.replace(/(\d{3})(\d{3})/, '$1-$2')}</div>
                            </div>
                            <div style={D.cardStats}>
                              <span>👥 {(group.members || []).length} Students attended</span>
                            </div>
                            {/* ✅ NEW: Session Details button opens modal */}
                            <button style={D.detailsBtn} onClick={() => openSessionDetails(group)}>
                              Session Details
                            </button>
                          </div>
                        );
                      })}

                      {groups.length === 0 && scheduledSessions.length === 0 && (
                        <div style={D.emptyState}>
                          <div style={D.emptyIcon}>📚</div>
                          <p style={D.emptyTitle}>No sessions yet</p>
                          <p style={D.emptyText}>Click "Plan Session" or "Create Instant" to get started</p>
                          <button style={D.createBtn} onClick={() => setShowSchedule(true)}>+ Create Session</button>
                        </div>
                      )}
                    </div>}
                  </div>

                  {/* Quick tools + activity */}
                  <div style={D.rightCol}>
                    <h3 style={D.rightTitle}>Quick Resource Tools</h3>
                    <div style={D.toolCard} onClick={quickQuizLoading ? undefined : handleOpenQuizCreator}>
                      <span style={D.toolIconBox}>📝</span>
                      <div style={D.toolInfo}><div style={D.toolName}>Create New Quiz</div><div style={D.toolDesc}>{quickQuizLoading ? 'Starting...' : 'Build questions & assign to classes'}</div></div>
                      <span style={D.toolArrow}>↗</span>
                    </div>
                    <div style={D.toolCard} onClick={() => setShowSchedule(true)}>
                      <span style={D.toolIconBox}>📅</span>
                      <div style={D.toolInfo}><div style={D.toolName}>Schedule Class</div><div style={D.toolDesc}>Pre-plan future sessions & PINs</div></div>
                      <span style={D.toolArrow}>↗</span>
                    </div>
                    <h3 style={{ ...D.rightTitle, marginTop:20 }}>🛡 Classroom Vibe Control</h3>
                    <div style={D.vibeCard}>
                      <div style={D.vibeRow}><span>💬 Chat Moderation</span><span style={D.strictBadge}>Strict</span></div>
                      <div style={D.vibeRow}><span>⏱ Session starting and Ending</span><span style={{ color:'#9ca3af' }}>-- min</span></div>
                      <button style={D.rulesBtn}>Manage Global Rules</button>
                    </div>
                    <h3 style={{ ...D.rightTitle, marginTop:20 }}>Recent Activity</h3>
                    {groups.slice(0, 4).map((g, i) => (
                      <div key={i} style={D.activityItem}>
                        <div style={D.actAvatar}>👤</div>
                        <div style={D.actText}><span style={D.actName}>{g.groupName}</span><span style={D.actDesc}> · {(g.members||[]).length} members</span></div>
                        <div style={D.actTime}>{formatDateTime(g.createdAt).time}</div>
                      </div>
                    ))}
                  </div>
                </div>
                </>)}

                {/* ═══ SCHEDULE ═══ */}
                {teacherView === 'schedule' && (<>
                  <div style={D.topBar}>
                    <h1 style={D.pageTitle}>Schedule</h1>
                    <div style={D.topActions}>
                      <button style={D.planBtn} onClick={() => setShowSchedule(true)}>📅 Plan Session</button>
                      <button style={D.createBtn} onClick={handleCreateInstantSession}>+ Create Instant</button>
                    </div>
                  </div>
                  {liveGroups.length > 0 && (<>
                    <div style={{ ...D.sectionBar, marginBottom:12 }}><h2 style={{ ...D.sectionTitle, fontSize:15, color:'#DC2626' }}>● Live Now</h2></div>
                    <div style={{ ...D.sessionGrid, marginBottom:28 }}>
                      {liveGroups.map(g => (
                        <div key={g._id} style={D.sessionCard}>
                          <div style={D.cardTopRow}><span style={D.liveBadge}>● Live</span><span style={{ fontSize:11, color:'#6b7280' }}>Started {formatDateTime(g.createdAt).time}</span></div>
                          <div style={D.sessionName}>{g.groupName}</div>
                          <div style={D.pinBox}><div style={D.pinLabel}>ACCESS PIN</div><div style={D.pinValue}>{g.pin?.replace(/(\d{3})(\d{3})/, '$1-$2')}</div></div>
                          <div style={D.cardStats}><span>👥 {(g.members||[]).length} students</span><span style={{ fontSize:11, color:'#9ca3af' }}>{formatDateTime(g.createdAt).date}</span></div>
                          <div style={{ display:'flex', gap:8 }}>
                            <button style={{ ...D.joinBtn, flex:1 }} onClick={() => selectGroup(g._id ?? g.id)}>Enter Session</button>
                            <button style={{ ...D.manageBtn, width:40, padding:'10px', fontSize:16 }} onClick={(e) => handleDeleteLiveGroup(g, e)} title="End & Delete">🗑</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>)}
                  {scheduledSessions.filter(s => s.status === 'scheduled').length > 0 && (<>
                    <div style={{ ...D.sectionBar, marginBottom:12 }}><h2 style={{ ...D.sectionTitle, fontSize:15, color:'#D97706' }}>● Upcoming</h2></div>
                    <div style={{ ...D.sessionGrid, marginBottom:28 }}>
                      {scheduledSessions.filter(s => s.status === 'scheduled').map(session => (
                        <div key={session._id} style={D.sessionCard}>
                          <div style={D.cardTopRow}><span style={D.scheduledBadge}>Scheduled</span><span style={{ fontSize:11, color:'#6b7280' }}>{(session.registeredStudents||[]).length} registered</span></div>
                          <div style={D.sessionName}>{session.sessionName}</div>
                          <div style={D.sessionMeta}>{session.scheduledDate ? new Date(session.scheduledDate).toLocaleDateString('en-US', { month:'short', day:'numeric' }) + ' at ' + session.scheduledTime : 'Date TBD'}</div>
                          <div style={D.pinBox}><div style={D.pinLabel}>PREVIEW PIN</div><div style={D.pinValue}>{session.customPin || '------'}</div></div>
                          <div style={D.cardStats}><span>👥 {(session.registeredStudents||[]).length} students</span><span style={D.modBadge}>{session.accessType === 'private' ? '🔒 Private' : '🌐 Public'}</span></div>
                          <div style={{ display:'flex', gap:8 }}>
                            <button style={{ ...D.manageBtn, flex:1 }} onClick={() => setManageSession(session)}>⚙️ Manage</button>
                            <button style={{ ...D.manageBtn, flex:1, color:'#DC2626', borderColor:'#fca5a5' }} onClick={(e) => handleDeleteScheduled(session, e)}>🗑️ Cancel</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>)}
                  {endedGroups.length > 0 && (<>
                    <div style={{ ...D.sectionBar, marginBottom:12 }}><h2 style={{ ...D.sectionTitle, fontSize:15, color:'#6b7280' }}>Completed</h2></div>
                    <div style={D.sessionGrid}>
                      {endedGroups.map((g, i) => (
                        <div key={g._id} style={{ ...D.sessionCard, opacity:0.85 }}>
                          <div style={D.cardTopRow}><span style={D.endedBadge}>Ended</span><span style={{ fontSize:11, color:'#9ca3af' }}>{formatDateTime(g.endedAt || g.createdAt).date}</span></div>
                          <div style={D.sessionName}>{g.groupName}</div>
                          <div style={D.cardStats}><span>👥 {(g.members||[]).length} attended</span><span style={{ fontSize:11, color:'#9ca3af' }}>{formatDateTime(g.createdAt).time}</span></div>
                          <div style={{ display:'flex', gap:8 }}>
                            <button style={{ ...D.detailsBtn, flex:1 }} onClick={() => openSessionDetails(g)}>View Details</button>
                            <button style={{ ...D.manageBtn, flex:1, fontSize:12, color:'#DC2626', borderColor:'#fca5a5' }} onClick={(e) => handleDeleteEndedGroup(g._id ?? g.id, e)}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>)}
                  {groups.length === 0 && scheduledSessions.length === 0 && (
                    <div style={{ textAlign:'center', padding:'80px 20px' }}>
                      <div style={{ fontSize:48, marginBottom:12 }}>📅</div>
                      <p style={{ fontSize:18, fontWeight:'600', color:'#374151', marginBottom:8 }}>No sessions yet</p>
                      <p style={{ fontSize:14, color:'#6b7280', marginBottom:20 }}>Create a session to get started.</p>
                      <button style={D.createBtn} onClick={() => setShowSchedule(true)}>+ Plan Session</button>
                    </div>
                  )}
                </>)}

                {/* ═══ QUIZ HISTORY ═══ */}
                {teacherView === 'quizhistory' && (<>
                  <div style={D.topBar}>
                    <h1 style={D.pageTitle}>Quiz History</h1>
                    <button style={D.planBtn} onClick={loadTeacherQuizHistory}>↻ Refresh</button>
                  </div>
                  {teacherQuizLoading ? (
                    <div style={{ textAlign:'center', padding:'80px 0', color:'#9ca3af' }}>Loading quiz history…</div>
                  ) : teacherQuizHistory.length === 0 ? (
                    <div style={{ textAlign:'center', padding:'80px 20px' }}>
                      <div style={{ fontSize:48, marginBottom:12 }}>📖</div>
                      <p style={{ fontSize:18, fontWeight:'600', color:'#374151', marginBottom:8 }}>No quizzes conducted yet</p>
                      <p style={{ fontSize:14, color:'#6b7280' }}>Create and conduct a quiz in a live session to see history here.</p>
                    </div>
                  ) : (
                    <div style={{ backgroundColor:'white', borderRadius:12, border:'1px solid #e5e7eb', overflow:'hidden' }}>
                      <div style={D.qhHeader}>
                        <span style={{ flex:2 }}>Quiz Title</span>
                        <span style={{ flex:1 }}>Session</span>
                        <span style={{ flex:1 }}>Date</span>
                        <span style={{ width:90 }}>Students</span>
                        <span style={{ width:90 }}>Avg Score</span>
                        <span style={{ width:100 }}>Status</span>
                      </div>
                      {teacherQuizHistory.map((quiz, i) => {
                        const title = quiz.title || quiz.quiz?.title || `Quiz ${i + 1}`;
                        const participants = quiz.participants?.length || 0;
                        const avgScore = quiz.averageScore ?? quiz.stats?.averageScore ?? null;
                        const status = quiz.status || 'completed';
                        return (
                          <div key={quiz._id || i} style={{ ...D.qhRow, backgroundColor: i % 2 === 0 ? (isDark?'#1e293b':'white') : (isDark?'#0f172a':'#fafafa') }}>
                            <span style={{ flex:2, fontWeight:'600', color:isDark?'#f1f5f9':'#111827', fontSize:13 }}>{title}</span>
                            <span style={{ flex:1, fontSize:12, color:isDark?'#94a3b8':'#6b7280' }}>{quiz.groupName}</span>
                            <span style={{ flex:1, fontSize:12, color:isDark?'#94a3b8':'#6b7280' }}>{quiz.createdAt ? formatDateTime(quiz.createdAt).date : '—'}</span>
                            <span style={{ width:90, fontSize:12, color:isDark?'#94a3b8':'undefined' }}>{participants} students</span>
                            <span style={{ width:90, fontSize:13, fontWeight:'700', color: avgScore >= 70 ? '#10B981' : avgScore !== null ? '#F59E0B' : '#9ca3af' }}>
                              {avgScore !== null ? `${Math.round(avgScore)}%` : '—'}
                            </span>
                            <span style={{ width:100 }}>
                              <span style={{ fontSize:10, fontWeight:'700', padding:'3px 8px', borderRadius:20, backgroundColor: status === 'completed' ? '#D1FAE5' : '#FEF3C7', color: status === 'completed' ? '#065F46' : '#92400E' }}>
                                {status === 'completed' ? '✓ Done' : status}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>)}

                {/* ═══ ANALYTICS ═══ */}
                {teacherView === 'analytics' && (() => {
                  // ── Computed data ──
                  const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
                  const now = new Date();
                  const weeklyData = weekdays.map((day, i) => {
                    const d = new Date(now); d.setDate(now.getDate() - (6 - i));
                    const ds = d.toDateString();
                    const dayGroups = groups.filter(g => new Date(g.createdAt).toDateString() === ds);
                    return { day, value: dayGroups.reduce((s, g) => s + (g.members?.length || 0), 0) };
                  });
                  const scoreBuckets = [
                    { range:'0-60', count:0 }, { range:'60-70', count:0 },
                    { range:'70-80', count:0 }, { range:'80-90', count:0 }, { range:'90-100', count:0 },
                  ];
                  teacherQuizHistory.forEach(q => {
                    const s = q.averageScore ?? q.stats?.averageScore ?? null;
                    if (s === null) return;
                    if (s < 60) scoreBuckets[0].count++;
                    else if (s < 70) scoreBuckets[1].count++;
                    else if (s < 80) scoreBuckets[2].count++;
                    else if (s < 90) scoreBuckets[3].count++;
                    else scoreBuckets[4].count++;
                  });
                  const masteryPct = teacherQuizHistory.length > 0
                    ? Math.round(teacherQuizHistory.reduce((s, q) => s + (q.averageScore ?? q.stats?.averageScore ?? 0), 0) / teacherQuizHistory.length)
                    : 0;
                  const avgQScore = masteryPct;
                  const avgStudents = groups.length > 0 ? Math.round(groups.reduce((s, g) => s + (g.members?.length || 0), 0) / groups.length) : 0;
                  const totalQs = teacherQuizHistory.reduce((s, q) => s + (q.questions?.length || q.quiz?.questions?.length || 0), 0);
                  const perfMap = {};
                  teacherQuizHistory.forEach(q => {
                    (q.participants || []).forEach(p => {
                      const key = String(p.userId || p._id || ''); if (!key) return;
                      if (!perfMap[key]) perfMap[key] = { name: p.username || p.name || 'Student', points:0, quizzes:0 };
                      perfMap[key].points += p.score || 0; perfMap[key].quizzes++;
                    });
                  });
                  const topPerformers = Object.values(perfMap).sort((a,b) => b.points - a.points).slice(0, 5);

                  // ── SVG chart helpers ──
                  const CW=520, CH=240, P={t:20,r:20,b:32,l:36};
                  const cw=CW-P.l-P.r, ch=CH-P.t-P.b;
                  const maxW = Math.max(...weeklyData.map(d => d.value), 1);
                  const wPts = weeklyData.map((d,i) => ({ x: P.l+(i/6)*cw, y: P.t+ch-(d.value/maxW)*ch }));
                  const wLine = wPts.map(p=>`${p.x},${p.y}`).join(' ');
                  const wArea = `M${wPts[0].x},${P.t+ch} L${wLine} L${wPts[6].x},${P.t+ch} Z`;
                  const maxB = Math.max(...scoreBuckets.map(d=>d.count), 1);
                  const DSZ=120, DSW=14, Drad=(DSZ-DSW)/2, Dcirc=2*Math.PI*Drad;
                  const Ddash=(masteryPct/100)*Dcirc, Dc=DSZ/2;

                  return (<>
                  <div style={D.topBar}>
                    <h1 style={D.pageTitle}>Analytics</h1>
                    <div style={D.topActions}>
                      <button style={D.planBtn} onClick={loadTeacherQuizHistory}>↻ Refresh</button>
                      <button style={D.planBtn} onClick={() => liveGroups.length ? setShowAnalytics(true) : alert('Enter a live session first.')}>📊 Live Analytics</button>
                    </div>
                  </div>

                  {/* Summary cards */}
                  <div style={D.statsRow}>
                    {[
                      { label:'Total Students', value:totalStudents, icon:'👥', sub:'Across all sessions' },
                      { label:'Avg Quiz Score',  value: avgQScore ? `${avgQScore}%` : '—', icon:'📝', sub:'All quizzes conducted' },
                      { label:'Participation',   value: avgStudents || '—', icon:'👤', sub:'Avg students / session' },
                      { label:'Questions Asked', value: totalQs, icon:'❓', sub:'All quizzes combined' },
                    ].map((s,i) => (
                      <div key={i} style={D.statCard}>
                        <div style={D.statIcon}>{s.icon}</div>
                        <div style={D.statLabel}>{s.label}</div>
                        <div style={D.statValue}>{s.value}</div>
                        <div style={D.statSub}>{s.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Two-column layout */}
                  <div style={{ display:'flex', gap:20, alignItems:'flex-start' }}>

                    {/* LEFT */}
                    <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:20 }}>

                      {/* Line chart */}
                      <div style={D.analyticsCard}>
                        <div style={D.analyticsCardTitle}>Class Participation Trend <span style={{ fontSize:11, color:'#9ca3af', fontWeight:400, marginLeft:8 }}>students / day · last 7 days</span></div>
                        <div style={D.analyticsCardSub}></div>
                        <svg width="100%" height={CH} viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" style={{ marginTop:8 }}>
                          {[0,0.25,0.5,0.75,1].map((f,i) => <line key={i} x1={P.l} y1={P.t+ch*(1-f)} x2={P.l+cw} y2={P.t+ch*(1-f)} stroke="#f3f4f6" strokeWidth="1"/>)}
                          <path d={wArea} fill="rgba(99,102,241,0.08)" />
                          <polyline points={wLine} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round"/>
                          {wPts.map((p,i) => <circle key={i} cx={p.x} cy={p.y} r="4" fill="white" stroke="#6366f1" strokeWidth="2"/>)}
                          {weeklyData.map((d,i) => <text key={i} x={wPts[i].x} y={CH-6} textAnchor="middle" fontSize="10" fill="#9ca3af">{d.day}</text>)}
                          {[0,Math.round(maxW/2),maxW].map((v,i) => {
                            const y=P.t+ch-(v/maxW)*ch;
                            return <text key={i} x={P.l-5} y={y+4} textAnchor="end" fontSize="9" fill="#9ca3af">{v}</text>;
                          })}
                        </svg>
                      </div>

                      {/* Bar chart */}
                      <div style={{ ...D.analyticsCard, minHeight:370 }}>
                        <div style={D.analyticsCardTitle}>Quiz Score Distribution <span style={{ fontSize:11, color:'#9ca3af', fontWeight:400, marginLeft:8 }}>{teacherQuizHistory.length > 0 ? `${teacherQuizHistory.length} quiz session${teacherQuizHistory.length!==1?'s':''}` : 'No quizzes yet'}</span></div>
                        {teacherQuizHistory.length === 0 ? (
                          <div style={D.analyticsEmpty}>Conduct a quiz to see score distribution</div>
                        ) : (() => {
                          const BW=520,BH=270,BP={t:20,r:20,b:30,l:30};
                          const bw=BW-BP.l-BP.r, bh=BH-BP.t-BP.b;
                          const barW=bw/5*0.55, gap=bw/5;
                          return (
                            <svg width="100%" height={BH} viewBox={`0 0 ${BW} ${BH}`} preserveAspectRatio="none" style={{ marginTop:8 }}>
                              {scoreBuckets.map((d,i) => {
                                const barH = d.count > 0 ? (d.count/maxB)*bh : 4;
                                const x=BP.l+i*gap+gap*0.225, y=BP.t+bh-barH;
                                return (
                                  <g key={i}>
                                    <rect x={x} y={y} width={barW} height={barH} fill={d.count>0?'#6366f1':'#e5e7eb'} rx="3"/>
                                    <text x={x+barW/2} y={BH-6} textAnchor="middle" fontSize="9" fill="#9ca3af">{d.range}</text>
                                    {d.count>0 && <text x={x+barW/2} y={y-4} textAnchor="middle" fontSize="10" fill="#6366f1" fontWeight="700">{d.count}</text>}
                                  </g>
                                );
                              })}
                            </svg>
                          );
                        })()}
                      </div>

                      {/* Top Performers */}
                      <div style={{ ...D.analyticsCard, minHeight:370 }}>
                        <div style={D.analyticsCardTitle}>Top Performers <span style={{ fontSize:11, color:'#9ca3af', fontWeight:400, marginLeft:8 }}>by quiz participation points</span></div>
                        {topPerformers.length === 0 ? (
                          <div style={D.analyticsEmpty}>Quiz participants will appear here</div>
                        ) : (
                          <table style={{ width:'100%', borderCollapse:'collapse', marginTop:12 }}>
                            <thead>
                              <tr>{['Rank','Student','Quizzes','Points'].map(h=><th key={h} style={{ fontSize:10,fontWeight:'700',color:'#9ca3af',textAlign:'left',padding:'6px 8px',letterSpacing:'0.5px' }}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {topPerformers.map((p,i)=>(
                                <tr key={i} style={{ borderTop:'1px solid #f3f4f6' }}>
                                  <td style={{ padding:'7px 8px',width:40,fontSize:15 }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</td>
                                  <td style={{ padding:'7px 8px' }}>
                                    <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                                      <div style={{ width:28,height:28,borderRadius:'50%',backgroundColor:'#EEF2FF',color:'#6366f1',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:'700',flexShrink:0 }}>{p.name.charAt(0).toUpperCase()}</div>
                                      <span style={{ fontSize:13,fontWeight:'600',color:'#111827' }}>{p.name}</span>
                                    </div>
                                  </td>
                                  <td style={{ padding:'10px 8px',fontSize:12,color:'#6b7280' }}>{p.quizzes}</td>
                                  <td style={{ padding:'10px 8px',fontSize:13,fontWeight:'700',color:'#6366f1' }}>{p.points}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    {/* RIGHT */}
                    <div style={{ width:256, flexShrink:0, display:'flex', flexDirection:'column', gap:20 }}>

                      {/* Student Insights */}
                      <div style={D.analyticsCard}>
                        <div style={D.analyticsCardTitle}>Student Insights</div>
                        <div style={D.analyticsCardSub}>Personal performance review</div>
                        <div style={{ backgroundColor:'#111827',borderRadius:12,padding:'20px',textAlign:'center',marginTop:12 }}>
                          <div style={{ fontSize:11,color:'#9ca3af',marginBottom:4,letterSpacing:'0.5px' }}>ENGAGEMENT SCORE</div>
                          <div style={{ fontSize:36,fontWeight:'900',color:'white',lineHeight:1.1 }}>{avgQScore || groups.length || 0}{avgQScore ? '%' : ''}</div>
                          <div style={{ fontSize:11,color:'#9ca3af',marginTop:4 }}>{avgQScore ? 'avg quiz score' : `${groups.length} session${groups.length!==1?'s':''} total`}</div>
                          <div style={{ display:'flex',justifyContent:'space-between',marginTop:16,paddingTop:12,borderTop:'1px solid #374151' }}>
                            <div><div style={{ fontSize:10,color:'#9ca3af' }}>Sessions</div><div style={{ fontSize:16,fontWeight:'700',color:'white' }}>{groups.length}</div></div>
                            <div><div style={{ fontSize:10,color:'#9ca3af' }}>Students</div><div style={{ fontSize:16,fontWeight:'700',color:'white' }}>{totalStudents}</div></div>
                            <div><div style={{ fontSize:10,color:'#9ca3af' }}>Quizzes</div><div style={{ fontSize:16,fontWeight:'700',color:'#10B981' }}>+{teacherQuizHistory.length}</div></div>
                          </div>
                        </div>
                      </div>

                      {/* Course Mastery Donut */}
                      <div style={{ ...D.analyticsCard, textAlign:'center' }}>
                        <div style={D.analyticsCardTitle}>Course Mastery</div>
                        <div style={D.analyticsCardSub}>Avg quiz performance</div>
                        <div style={{ display:'flex',justifyContent:'center',margin:'16px 0 12px' }}>
                          <svg width={DSZ} height={DSZ}>
                            <circle cx={Dc} cy={Dc} r={Drad} fill="none" stroke="#f3f4f6" strokeWidth={DSW}/>
                            <circle cx={Dc} cy={Dc} r={Drad} fill="none" stroke="#6366f1" strokeWidth={DSW}
                              strokeDasharray={`${Ddash} ${Dcirc}`} strokeDashoffset={Dcirc/4} strokeLinecap="round"/>
                            <text x={Dc} y={Dc+7} textAnchor="middle" fontSize="20" fontWeight="800" fill={isDark ? '#f1f5f9' : '#111827'}>{masteryPct}%</text>
                            <text x={Dc} y={Dc+22} textAnchor="middle" fontSize="9" fill={isDark ? '#64748b' : '#9ca3af'}>Progress</text>
                          </svg>
                        </div>
                        <div style={{ display:'flex',gap:8,fontSize:11 }}>
                          {[['Active',liveGroups.length,'#D1FAE5','#065F46'],['Completed',endedGroups.length,'#F3F4F6','#6b7280']].map(([label,val,bg,color])=>(
                            <div key={label} style={{ flex:1,padding:'8px',backgroundColor:bg,borderRadius:8,textAlign:'center' }}>
                              <div style={{ color:'#9ca3af',marginBottom:2 }}>{label}</div>
                              <div style={{ fontWeight:'700',color }}>{val}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Recent Quiz History */}
                      <div style={D.analyticsCard}>
                        <div style={D.analyticsCardTitle}>Recent Quiz History</div>
                        <div style={D.analyticsCardSub}>Latest topics</div>
                        {teacherQuizHistory.length === 0 ? (
                          <div style={D.analyticsEmpty}>No quizzes yet</div>
                        ) : (
                          <div style={{ marginTop:12 }}>
                            {teacherQuizHistory.slice(0,5).map((q,i)=>{
                              const score = q.averageScore ?? q.stats?.averageScore ?? null;
                              const passed = score !== null && score >= 60;
                              return (
                                <div key={i} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f3f4f6' }}>
                                  <div style={{ minWidth:0,flex:1,paddingRight:8 }}>
                                    <div style={{ fontSize:13,fontWeight:'600',color:'#111827',marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{q.title||q.quiz?.title||`Quiz ${i+1}`}</div>
                                    <div style={{ fontSize:10,color:'#9ca3af' }}>{q.groupName} · {q.createdAt?formatDateTime(q.createdAt).date:'—'}</div>
                                  </div>
                                  <div style={{ textAlign:'right',flexShrink:0 }}>
                                    <div style={{ fontSize:15,fontWeight:'800',color:score!==null?(passed?'#111827':'#EF4444'):'#9ca3af' }}>{score!==null?`${Math.round(score)}/100`:'—'}</div>
                                    {score!==null && <div style={{ fontSize:9,fontWeight:'700',color:passed?'#10B981':'#EF4444' }}>{passed?'Passed':'Failed'}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Section Breakdown Table */}
                  <div style={{ ...D.analyticsCard, marginTop:20, padding:0, overflow:'hidden' }}>
                    <div style={{ padding:'20px 20px 12px' }}>
                      <div style={D.analyticsCardTitle}>Section Breakdown</div>
                      <div style={D.analyticsCardSub}>Performance metrics across classroom sessions</div>
                    </div>
                    <div style={D.qhHeader}>
                      <span style={{ flex:2 }}>Session / Class</span><span style={{ flex:1 }}>Students</span>
                      <span style={{ flex:1 }}>Quizzes</span><span style={{ width:100 }}>Status</span>
                    </div>
                    {groups.length===0&&scheduledSessions.length===0&&<div style={{ textAlign:'center',padding:'40px',color:'#9ca3af',fontSize:14 }}>No sessions yet</div>}
                    {[...groups].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map((g,i)=>(
                      <div key={g._id} style={{ ...D.qhRow, backgroundColor: i%2===0?(isDark?'#1e293b':'white'):(isDark?'#0f172a':'#fafafa') }}>
                        <span style={{ flex:2,fontWeight:'600',color:isDark?'#f1f5f9':'#111827',fontSize:13 }}>{g.groupName}</span>
                        <span style={{ flex:1,fontSize:12,color:isDark?'#94a3b8':'#374151' }}>{(g.members||[]).length}</span>
                        <span style={{ flex:1,fontSize:12,color:isDark?'#64748b':'#6b7280' }}>{teacherQuizHistory.filter(q=>String(q.groupId)===String(g._id??g.id)).length}</span>
                        <span style={{ width:100 }}><span style={{ fontSize:10,fontWeight:'700',padding:'3px 8px',borderRadius:20,backgroundColor:g.isActive?'#D1FAE5':'#F3F4F6',color:g.isActive?'#065F46':'#6b7280' }}>{g.isActive?'Active':'Completed'}</span></span>
                      </div>
                    ))}
                    {scheduledSessions.filter(s=>s.status==='scheduled').map((s,i)=>(
                      <div key={s._id} style={{ ...D.qhRow, backgroundColor:(groups.length+i)%2===0?(isDark?'#1e293b':'white'):(isDark?'#0f172a':'#fafafa') }}>
                        <span style={{ flex:2,fontWeight:'600',color:isDark?'#f1f5f9':'#111827',fontSize:13 }}>{s.sessionName}</span>
                        <span style={{ flex:1,fontSize:12 }}>{(s.registeredStudents||[]).length}</span>
                        <span style={{ flex:1,fontSize:12,color:'#9ca3af' }}>—</span>
                        <span style={{ width:100 }}><span style={{ fontSize:10,fontWeight:'700',padding:'3px 8px',borderRadius:20,backgroundColor:'#FEF3C7',color:'#92400E' }}>Scheduled</span></span>
                      </div>
                    ))}
                  </div>

                  {liveGroups.length > 0 && (
                    <div style={{ backgroundColor:'#EEF2FF',borderRadius:12,padding:'16px 20px',border:'1px solid #c7d2fe',marginTop:20 }}>
                      <div style={{ fontWeight:'700',color:'#3730a3',marginBottom:4 }}>Live sessions active — open per-class analytics</div>
                      <div style={{ display:'flex',gap:10,flexWrap:'wrap',marginTop:10 }}>
                        {liveGroups.map(g=>(
                          <button key={g._id} style={{ ...D.planBtn,backgroundColor:'#4F46E5',color:'white',border:'none' }}
                            onClick={()=>selectGroup(g._id??g.id)}>
                            📊 Enter {g.groupName}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  </>);
                })()}

                {/* ═══ SETTINGS ═══ */}
                {teacherView === 'settings' && (<>
                  <div style={D.topBar}><h1 style={D.pageTitle}>Settings</h1></div>
                  <div style={{ maxWidth:520 }}>
                    <div style={{ backgroundColor:'white', borderRadius:12, border:'1px solid #e5e7eb', padding:'24px', marginBottom:16 }}>
                      <div style={{ fontSize:15, fontWeight:'700', color:'#111827', marginBottom:4 }}>Profile Information</div>
                      <div style={{ fontSize:12, color:'#9ca3af', marginBottom:20 }}>Update your display name</div>
                      <div style={{ marginBottom:14 }}>
                        <label style={{ fontSize:12, fontWeight:'700', color:'#374151', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.5px' }}>Display Name</label>
                        <input style={{ width:'100%', padding:'10px 13px', fontSize:14, border:'1.5px solid #e2e8f0', borderRadius:8, outline:'none', color:'#1e293b', boxSizing:'border-box' }}
                          value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Your name" maxLength={50} />
                      </div>
                      <div style={{ marginBottom:20 }}>
                        <label style={{ fontSize:12, fontWeight:'700', color:'#374151', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.5px' }}>Email</label>
                        <input style={{ width:'100%', padding:'10px 13px', fontSize:14, border:'1.5px solid #e2e8f0', borderRadius:8, outline:'none', backgroundColor:'#f8fafc', color:'#94a3b8', cursor:'not-allowed', boxSizing:'border-box' }}
                          value={user?.email || '—'} readOnly />
                      </div>
                      <button style={{ ...D.createBtn, width:'auto' }} onClick={handleProfileSave} disabled={profileSaving}>
                        {profileSaving ? 'Saving…' : 'Save Changes'}
                      </button>
                      {profileMsg && (
                        <div style={{ marginTop:10, fontSize:13, padding:'8px 12px', borderRadius:6, backgroundColor: profileMsg.includes('success') || profileMsg.includes('!') ? '#f0fdf4' : '#fef2f2', color: profileMsg.includes('success') || profileMsg.includes('!') ? '#15803d' : '#dc2626' }}>
                          {profileMsg}
                        </div>
                      )}
                    </div>
                  </div>
                </>)}

              </div>
            </div>

          ) : (
            /* ── STUDENT HUB ── */
            <div style={SD.shell}>

              {/* LEFT SIDEBAR */}
              <div style={{ ...SD.sidebar, width: sidebarCollapsed ? 64 : 220, transition:'width 0.22s ease' }}>
                {/* Logo toggle — click anywhere on it to expand/collapse */}
                <button style={SD.logoToggleBtn} onClick={() => setSidebarCollapsed(v => !v)} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                  <span style={{ fontSize:20, flexShrink:0 }}>🎓</span>
                  {!sidebarCollapsed && <span style={SD.logoText}>ClassVibe</span>}
                </button>

                {/* Nav items */}
                {[
                  { icon:'📊', label:'Dashboard',    view:'dashboard' },
                  { icon:'📅', label:'Schedule',     view:'schedule' },
                  { icon:'📝', label:'Quizzes',      view:'quizzes' },
                  { icon:'📋', label:'Session List', view:'sessionlist' },
                  { icon:'⚙️', label:'Settings',     view:'settings' },
                ].map((item, i) => (
                  <button key={i}
                    title={sidebarCollapsed ? item.label : undefined}
                    style={{ ...SD.navItem, justifyContent: sidebarCollapsed ? 'center' : 'flex-start', backgroundColor: studentView === item.view ? '#EEF2FF' : 'transparent', color: studentView === item.view ? '#4F46E5' : '#6b7280', fontWeight: studentView === item.view ? '700' : '500' }}
                    onClick={() => setStudentView(item.view)}>
                    <span style={SD.navIcon}>{item.icon}</span>
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </button>
                ))}

                <div style={SD.sidebarSpacer} />

                {/* User info */}
                {!sidebarCollapsed ? (
                  <div style={SD.sidebarUser}>
                    <div style={SD.userAvatar}>{displayName.charAt(0).toUpperCase()}</div>
                    <div><div style={SD.userName}>{displayName}</div><div style={SD.userRole}>Student</div></div>
                  </div>
                ) : (
                  <div style={{ display:'flex', justifyContent:'center', padding:'8px 0' }}>
                    <div style={SD.userAvatar} title={displayName}>{displayName.charAt(0).toUpperCase()}</div>
                  </div>
                )}

                {/* Theme toggle */}
                <button onClick={toggleTheme} title="Toggle dark/light mode" style={SD.themeToggleBtn}>
                  {sidebarCollapsed ? (isDark ? '☀️' : '🌙') : (isDark ? '☀️ Light Mode' : '🌙 Dark Mode')}
                </button>

                {/* Logout */}
                <button onClick={handleLogout} style={SD.logoutBtn} title={sidebarCollapsed ? 'Logout' : undefined}>
                  {sidebarCollapsed ? '🚪' : '→ Logout'}
                </button>
              </div>

              {/* MAIN CONTENT */}
              <div style={SD.main}>

                {/* ════ DASHBOARD ════ */}
                {studentView === 'dashboard' && (<>
                  <div style={SD.topBar}>
                    <div>
                      <h1 style={SD.pageTitle}>Welcome back, {displayName}!</h1>
                      <p style={SD.pageSubtitle}>
                        {liveGroups.length > 0
                          ? `You have ${liveGroups.length} live session${liveGroups.length > 1 ? 's' : ''} happening right now`
                          : 'No live sessions right now — check back soon'}
                      </p>
                    </div>
                  </div>

                  {/* 4 Stat cards — skeleton while groups load */}
                  <div style={SD.statsRow}>
                    {groupsLoading ? [0,1,2,3].map(i => (
                      <div key={i} style={SD.statCard}>
                        <div className="cv-skeleton" style={{ width:40, height:40, borderRadius:10, flexShrink:0 }} />
                        <div style={{ flex:1 }}>
                          <div className="cv-skeleton" style={{ width:'55%', height:10, marginBottom:8 }} />
                          <div className="cv-skeleton" style={{ width:'35%', height:20 }} />
                        </div>
                      </div>
                    )) : [
                      { label:'ACTIVE SESSIONS',  value:liveGroups.length,  icon:'⚡', color:'#10B981', bg:'#D1FAE5' },
                      { label:'SESSIONS JOINED',  value:groups.length,       icon:'📚', color:'#6366f1', bg:'#EEF2FF' },
                      { label:'COMPLETED',        value:endedGroups.length,  icon:'✅', color:'#6b7280', bg:'#F3F4F6' },
                      { label:'UPCOMING',         value:0,                   icon:'📅', color:'#F59E0B', bg:'#FEF3C7' },
                    ].map((s, i) => (
                      <div key={i} style={SD.statCard}>
                        <div style={{ ...SD.statIconBox, backgroundColor: s.bg, color: s.color }}>{s.icon}</div>
                        <div><div style={SD.statLabel}>{s.label}</div><div style={{ ...SD.statValue, color: s.color }}>{s.value}</div></div>
                      </div>
                    ))}
                  </div>

                  {/* Active session banner (if any) */}
                  {liveGroups.length > 0 && (
                    <div style={SD.activeBanner}>
                      <div style={SD.activeBannerLeft}>
                        <span style={SD.activePulse} />
                        <div>
                          <div style={SD.activeBannerTitle}>Active Session: {liveGroups[0].groupName}</div>
                          <div style={SD.activeBannerSub}>by {liveGroups[0].admin?.name || liveGroups[0].admin?.username || 'Teacher'} · {(liveGroups[0].members || []).length} members</div>
                        </div>
                      </div>
                      <button style={SD.activeBannerBtn} onClick={() => selectGroup(liveGroups[0]._id ?? liveGroups[0].id)}>
                        Join Now →
                      </button>
                    </div>
                  )}

                  <div style={SD.contentRow}>
                    <div style={SD.mainCol}>
                      {/* Join Session card — compact */}
                      <div style={SD.joinCard}>
                        <div style={SD.joinCardTitle}>🔑 Join Live Session</div>
                        <p style={SD.joinCardDesc}>Enter your 6-digit session PIN from the teacher.</p>
                        <input style={SD.pinInput} placeholder="• • • • • •" maxLength={6} value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && handleStudentPinJoin()} />
                        <button style={{ ...SD.joinSessionBtn, backgroundColor: pinInput.length === 6 ? '#4F46E5' : '#e5e7eb', color: pinInput.length === 6 ? 'white' : '#9ca3af', border:'none' }} onClick={handleStudentPinJoin}>
                          Join Session
                        </button>
                      </div>

                      {/* My Classes — skeleton while loading */}
                      {groupsLoading && (
                        <div style={SD.classGrid}>
                          {[0,1,2].map(i => (
                            <div key={i} style={SD.classCard}>
                              <div className="cv-skeleton" style={{ width:'40%', height:18, borderRadius:10, marginBottom:14 }} />
                              <div className="cv-skeleton" style={{ width:'70%', height:15, marginBottom:8 }} />
                              <div className="cv-skeleton" style={{ width:'50%', height:11, marginBottom:20 }} />
                              <div className="cv-skeleton" style={{ width:'100%', height:34, borderRadius:8 }} />
                            </div>
                          ))}
                        </div>
                      )}

                      {!groupsLoading && groups.length > 0 && (<>
                        <div style={SD.sectionBar}>
                          <h2 style={SD.sectionTitle}>My Classes</h2>
                          <button style={SD.viewAllBtn} onClick={() => setStudentView('live')}>View All →</button>
                        </div>
                        <div style={SD.classGrid}>
                          {liveGroups.slice(0, 2).map(group => (
                            <div key={group._id} style={SD.classCard}>
                              <div style={SD.classBadgeActive}>● LIVE</div>
                              <div style={SD.className}>{group.groupName}</div>
                              <div style={SD.classTeacher}>{group.admin?.name || group.admin?.username || 'Teacher'}</div>
                              <div style={{ fontSize:12, color:'#6b7280', marginBottom:12 }}>👥 {(group.members||[]).length} members · {(group.onlineUsers||[]).length} online</div>
                              <button style={SD.enterClassBtn} onClick={() => selectGroup(group._id ?? group.id)}>Enter Classroom →</button>
                            </div>
                          ))}
                          {endedGroups.slice(0, Math.max(0, 3 - liveGroups.slice(0,2).length)).map(group => (
                            <div key={group._id} style={{ ...SD.classCard, opacity:0.7 }}>
                              <div style={SD.classBadgeDone}>COMPLETED</div>
                              <div style={SD.className}>{group.groupName}</div>
                              <div style={SD.classTeacher}>{group.admin?.name || group.admin?.username || 'Teacher'}</div>
                              <div style={{ fontSize:12, color:'#9ca3af', marginTop:8 }}>{formatDateTime(group.createdAt).date}</div>
                            </div>
                          ))}
                        </div>
                      </>)}

                      {!groupsLoading && groups.length === 0 && (
                        <div style={SD.emptyState}>
                          <div style={SD.emptyIcon}>🎒</div>
                          <p style={SD.emptyTitle}>No classrooms joined yet</p>
                          <p style={SD.emptyText}>Enter a PIN above to join your first classroom!</p>
                        </div>
                      )}
                    </div>

                    {/* RIGHT: Session list */}
                    <div style={SD.rightCol}>
                      <div style={SD.sessionListCard}>
                        <div style={SD.sessionListHeader}>
                          <span style={SD.sessionListTitle}>Recent Sessions</span>
                          <span style={SD.sessionListBadge}>{groups.length}</span>
                        </div>
                        {groupsLoading
                          ? [0,1,2,3].map(i => (
                            <div key={i} style={{ ...SD.sessionListItem, alignItems:'center' }}>
                              <div className="cv-skeleton" style={{ width:8, height:8, borderRadius:'50%', flexShrink:0 }} />
                              <div style={{ flex:1, margin:'0 10px' }}>
                                <div className="cv-skeleton" style={{ width:'60%', height:11, marginBottom:5 }} />
                                <div className="cv-skeleton" style={{ width:'40%', height:9 }} />
                              </div>
                              <div className="cv-skeleton" style={{ width:30, height:9, borderRadius:4 }} />
                            </div>
                          ))
                          : groups.slice(0, 7).map((g, i) => (
                            <div key={i} style={SD.sessionListItem}>
                              <div style={{ ...SD.sessionListDot, backgroundColor: g.isActive ? '#10B981' : '#e5e7eb' }} />
                              <div style={SD.sessionListInfo}>
                                <div style={SD.sessionListName}>{g.groupName}</div>
                                <div style={SD.sessionListSub}>{g.admin?.name || g.admin?.username || 'Teacher'}</div>
                              </div>
                              <div style={{ fontSize:10, fontWeight:'700', color: g.isActive ? '#10B981' : '#9ca3af' }}>
                                {g.isActive ? 'LIVE' : formatDateTime(g.createdAt).date}
                              </div>
                            </div>
                          ))}
                        {!groupsLoading && groups.length === 0 && <p style={{ fontSize:13, color:'#9ca3af', textAlign:'center', padding:'20px 0' }}>No sessions yet</p>}
                      </div>
                    </div>
                  </div>
                </>)}

                {/* ════ LIVE SESSIONS ════ */}
                {studentView === 'live' && (<>
                  <div style={SD.topBar}>
                    <h1 style={SD.pageTitle}>Live Sessions</h1>
                    <button style={SD.refreshBtn} onClick={() => loadGroups(false)}>↻ Refresh</button>
                  </div>
                  {liveGroups.length === 0 ? (
                    <div style={SD.emptyState}>
                      <div style={SD.emptyIcon}>⚡</div>
                      <p style={SD.emptyTitle}>No live sessions right now</p>
                      <p style={SD.emptyText}>Your teacher hasn't started a session yet. Check back soon!</p>
                      <button style={{ marginTop:16, ...SD.enterClassBtn, display:'inline-block', width:'auto', padding:'10px 24px' }} onClick={() => loadGroups(false)}>Refresh</button>
                    </div>
                  ) : (
                    <div style={SD.sessionGrid}>
                      {liveGroups.map(group => (
                        <div key={group._id} style={SD.liveSessionCard}>
                          <div style={SD.liveCardHeader}>
                            <span style={SD.liveCardBadge}><span style={SD.liveDot} />Live Now</span>
                            <span style={{ fontSize:12, color:'#6b7280' }}>👥 {(group.members||[]).length}</span>
                          </div>
                          <div style={SD.liveCardName}>{group.groupName}</div>
                          <div style={SD.liveCardTeacher}>
                            <span style={SD.teacherChip}>{(group.admin?.name || group.admin?.username || 'Teacher').charAt(0).toUpperCase()}</span>
                            {group.admin?.name || group.admin?.username || 'Teacher'}
                          </div>
                          <div style={SD.liveCardMeta}>
                            <span style={{ color:'#10B981', fontWeight:'600' }}>● SESSION ACTIVE</span>
                            <span>{(group.onlineUsers||[]).length} online</span>
                          </div>
                          <button style={SD.enterBtn} onClick={() => selectGroup(group._id ?? group.id)}>
                            Join Classroom →
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* All sessions history */}
                  {endedGroups.length > 0 && (<>
                    <div style={{ ...SD.sectionBar, marginTop:32 }}>
                      <h2 style={{ ...SD.sectionTitle, fontSize:15 }}>Past Sessions</h2>
                    </div>
                    <div style={SD.sessionGrid}>
                      {endedGroups.map(group => (
                        <div key={group._id} style={{ ...SD.liveSessionCard, opacity:0.75, borderColor:'#f3f4f6' }}>
                          <div style={SD.liveCardHeader}>
                            <span style={{ ...SD.liveCardBadge, color:'#6b7280', backgroundColor:'#f3f4f6' }}>Completed</span>
                            <span style={{ fontSize:12, color:'#9ca3af' }}>👥 {(group.members||[]).length}</span>
                          </div>
                          <div style={SD.liveCardName}>{group.groupName}</div>
                          <div style={SD.liveCardTeacher}>
                            <span style={SD.teacherChip}>{(group.admin?.name || group.admin?.username || 'T').charAt(0).toUpperCase()}</span>
                            {group.admin?.name || group.admin?.username || 'Teacher'}
                          </div>
                          <div style={SD.liveCardMeta}>
                            <span style={{ color:'#9ca3af' }}>● SESSION ENDED</span>
                            <span>{formatDateTime(group.createdAt).date}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>)}
                </>)}

                {/* ════ PARTICIPANTS ════ */}
                {studentView === 'participants' && (<>
                  <div style={SD.topBar}>
                    <h1 style={SD.pageTitle}>Participants</h1>
                    <button style={SD.refreshBtn} onClick={() => loadGroups(false)}>↻ Refresh</button>
                  </div>
                  {liveGroups.length === 0 ? (
                    <div style={SD.emptyState}>
                      <div style={SD.emptyIcon}>👥</div>
                      <p style={SD.emptyTitle}>No active sessions</p>
                      <p style={SD.emptyText}>Join an active session to see participants here.</p>
                    </div>
                  ) : liveGroups.map(group => {
                    const onlineIds = new Set((group.onlineUsers || []).map(u => String(u._id || u.id || u)));
                    const onlineMembers = (group.members || []).filter(m => {
                      const mId = String(m.user?._id || m.user?.id || m._id || m.id || '');
                      return mId && onlineIds.has(mId);
                    });
                    const adminId = String(group.admin?._id ?? group.admin?.id ?? group.admin ?? '');
                    const colors = ['#6366f1','#10B981','#F59E0B','#EF4444','#3B82F6','#8B5CF6','#EC4899','#14B8A6'];
                    return (
                      <div key={group._id} style={{ marginBottom:32 }}>
                        <div style={SD.sectionBar}>
                          <h2 style={SD.sectionTitle}>{group.groupName}</h2>
                          <span style={SD.onlineBadge}>{onlineMembers.length} Online</span>
                        </div>
                        {onlineMembers.length === 0 ? (
                          <div style={{ ...SD.emptyState, padding:'32px 20px' }}>
                            <div style={{ fontSize:32, marginBottom:8 }}>👥</div>
                            <p style={{ ...SD.emptyTitle, fontSize:15 }}>No one online right now</p>
                          </div>
                        ) : (
                          <div style={SD.participantListWrap}>
                            {onlineMembers.map((m, i) => {
                              const name = m.user?.name || m.user?.username || m.name || m.username || `Member ${i+1}`;
                              const mId = String(m.user?._id || m.user?.id || m._id || m.id || '');
                              const isTeacher = mId && mId === adminId;
                              return (
                                <div key={i} style={SD.participantRow}>
                                  <div style={{ ...SD.participantAvatarSm, backgroundColor: colors[i % colors.length] }}>
                                    {name.charAt(0).toUpperCase()}
                                  </div>
                                  <div style={SD.participantInfo}>
                                    <div style={SD.participantNameText}>{name}</div>
                                    <div style={isTeacher ? SD.roleTeacher : SD.roleStudent}>
                                      {isTeacher ? '👨‍🏫 Teacher' : '👤 Student'}
                                    </div>
                                  </div>
                                  <div style={SD.onlineIndicator}>
                                    <span style={SD.onlineDotGreen} />
                                    Online
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>)}

                {/* ════ SCHEDULE ════ */}
                {studentView === 'schedule' && (<>
                  <div style={SD.topBar}>
                    <h1 style={SD.pageTitle}>Schedule</h1>
                    <button style={SD.refreshBtn} onClick={() => loadGroups(false)}>↻ Refresh</button>
                  </div>
                  {groups.length === 0 ? (
                    <div style={SD.emptyState}>
                      <div style={SD.emptyIcon}>📅</div>
                      <p style={SD.emptyTitle}>No sessions yet</p>
                      <p style={SD.emptyText}>Join a session using a PIN — it will appear here.</p>
                    </div>
                  ) : (<>
                    {liveGroups.length > 0 && (<>
                      <div style={{ ...SD.sectionBar, marginBottom:12 }}>
                        <h2 style={{ ...SD.sectionTitle, color:'#10B981', display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ width:8, height:8, borderRadius:'50%', backgroundColor:'#10B981', display:'inline-block' }} />
                          Live Now
                        </h2>
                      </div>
                      <div style={SD.sessionGrid}>
                        {liveGroups.map(group => (
                          <div key={group._id} style={SD.liveSessionCard}>
                            <div style={SD.liveCardHeader}>
                              <span style={SD.liveCardBadge}><span style={SD.liveDot} />LIVE</span>
                              <span style={{ fontSize:11, color:'#6b7280' }}>{formatDateTime(group.createdAt).time}</span>
                            </div>
                            <div style={SD.liveCardName}>{group.groupName}</div>
                            <div style={SD.liveCardTeacher}>
                              <span style={SD.teacherChip}>{(group.admin?.name || group.admin?.username || 'T').charAt(0).toUpperCase()}</span>
                              {group.admin?.name || group.admin?.username || 'Teacher'}
                            </div>
                            <div style={{ fontSize:11, color:'#6b7280', marginBottom:14 }}>{formatDateTime(group.createdAt).date} · {(group.members||[]).length} members</div>
                            <button style={SD.enterBtn} onClick={() => selectGroup(group._id ?? group.id)}>Join Now →</button>
                          </div>
                        ))}
                      </div>
                    </>)}
                    {endedGroups.length > 0 && (
                      <div style={{ marginTop: liveGroups.length > 0 ? 28 : 0 }}>
                        <div style={{ ...SD.sectionBar, marginBottom:12 }}>
                          <h2 style={{ ...SD.sectionTitle, color:'#6b7280' }}>Past Sessions</h2>
                        </div>
                        <div style={SD.sessionGrid}>
                          {endedGroups.map(group => (
                            <div key={group._id} style={{ ...SD.liveSessionCard, opacity:0.8, borderColor:'#f3f4f6' }}>
                              <div style={SD.liveCardHeader}>
                                <span style={{ ...SD.liveCardBadge, color:'#6b7280', backgroundColor:'#f3f4f6' }}>COMPLETED</span>
                                <span style={{ fontSize:11, color:'#9ca3af' }}>{formatDateTime(group.createdAt).date}</span>
                              </div>
                              <div style={SD.liveCardName}>{group.groupName}</div>
                              <div style={SD.liveCardTeacher}>
                                <span style={SD.teacherChip}>{(group.admin?.name || group.admin?.username || 'T').charAt(0).toUpperCase()}</span>
                                {group.admin?.name || group.admin?.username || 'Teacher'}
                              </div>
                              <div style={{ fontSize:11, color:'#9ca3af' }}>{(group.members||[]).length} members attended</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>)}
                </>)}

                {/* ════ QUIZZES ════ */}
                {studentView === 'quizzes' && (<>
                  <div style={SD.topBar}>
                    <h1 style={SD.pageTitle}>Quizzes</h1>
                    <button style={SD.refreshBtn} onClick={loadStudentQuizzes}>↻ Refresh</button>
                  </div>
                  {quizLoading ? (
                    <div style={{ textAlign:'center', padding:'60px 0', color:'#9ca3af', fontSize:14 }}>Loading quizzes…</div>
                  ) : quizData.length === 0 ? (
                    <div style={SD.emptyState}>
                      <div style={SD.emptyIcon}>📝</div>
                      <p style={SD.emptyTitle}>No quizzes yet</p>
                      <p style={SD.emptyText}>Quizzes from your joined classrooms will appear here once the teacher creates them.</p>
                    </div>
                  ) : (
                    <div style={SD.quizGrid}>
                      {quizData.map((quiz, i) => {
                        const attempted = quiz.status === 'completed' || (quiz.participants && quiz.participants.some(p => String(p.userId || p._id) === String(user?._id || user?.id)));
                        const score = quiz.myScore ?? quiz.score ?? null;
                        const qTitle = quiz.title || quiz.quiz?.title || `Quiz ${i + 1}`;
                        const qCount = quiz.questions?.length || quiz.quiz?.questions?.length || 0;
                        return (
                          <div key={quiz._id || i} style={SD.quizCard}>
                            <div style={{ ...SD.quizBadge, backgroundColor: attempted ? '#D1FAE5' : '#FEF3C7', color: attempted ? '#065F46' : '#92400E' }}>
                              {attempted ? '✓ Attempted' : '◌ Not Attempted'}
                            </div>
                            <div style={SD.quizTitle}>{qTitle}</div>
                            <div style={SD.quizMeta}>{quiz.groupName}</div>
                            {qCount > 0 && <div style={{ fontSize:11, color:'#9ca3af', marginTop:4 }}>{qCount} questions</div>}
                            {attempted && score !== null && (
                              <div style={SD.quizScore}>Score: {score}%</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>)}

                {/* ════ SESSION LIST ════ */}
                {studentView === 'sessionlist' && (<>
                  <div style={SD.topBar}>
                    <h1 style={SD.pageTitle}>Session List</h1>
                    <button style={SD.refreshBtn} onClick={() => loadGroups(false)}>↻ Refresh</button>
                  </div>
                  {groups.length === 0 ? (
                    <div style={SD.emptyState}>
                      <div style={SD.emptyIcon}>📋</div>
                      <p style={SD.emptyTitle}>No sessions joined</p>
                      <p style={SD.emptyText}>Use a 6-digit PIN to join a session — it will appear here.</p>
                    </div>
                  ) : (
                    <div style={SD.tableWrap}>
                      <div style={SD.tableHeader}>
                        <span style={{ flex:2 }}>Session Name</span>
                        <span style={{ flex:1 }}>Teacher</span>
                        <span style={{ flex:1 }}>Date</span>
                        <span style={{ width:110 }}>Status</span>
                        <span style={{ width:72 }}>Action</span>
                      </div>
                      {[...groups].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((g, i) => (
                        <div key={g._id} style={{ ...SD.tableRow, backgroundColor: i % 2 === 0 ? (isDark?'#1e293b':'white') : (isDark?'#0f172a':'#fafafa') }}>
                          <span style={{ flex:2, fontWeight:'600', color:isDark?'#f1f5f9':'#111827', fontSize:13 }}>{g.groupName}</span>
                          <span style={{ flex:1, fontSize:12, color:isDark?'#94a3b8':'#6b7280' }}>{g.admin?.name || g.admin?.username || 'Teacher'}</span>
                          <span style={{ flex:1, fontSize:12, color:isDark?'#94a3b8':'#6b7280' }}>{formatDateTime(g.createdAt).date}</span>
                          <span style={{ width:110 }}>
                            <span style={{ fontSize:10, fontWeight:'700', padding:'3px 8px', borderRadius:'20px', backgroundColor: g.isActive ? '#D1FAE5' : '#F3F4F6', color: g.isActive ? '#10B981' : '#6b7280' }}>
                              {g.isActive ? '● LIVE' : '✓ COMPLETED'}
                            </span>
                          </span>
                          <span style={{ width:72 }}>
                            {g.isActive && (
                              <button style={{ fontSize:11, padding:'5px 10px', backgroundColor:'#4F46E5', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'700' }} onClick={() => selectGroup(g._id ?? g.id)}>
                                Enter
                              </button>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>)}

                {/* ════ SETTINGS ════ */}
                {studentView === 'settings' && (<>
                  <div style={SD.topBar}><h1 style={SD.pageTitle}>Settings</h1></div>

                  {/* Section 1: Profile Information — FUNCTIONAL */}
                  <div style={SD.settingsCard}>
                    <div style={SD.settingsCardHeader}>
                      <div style={SD.settingsCardIcon}>👤</div>
                      <div>
                        <div style={SD.settingsCardTitle}>Profile Information</div>
                        <div style={SD.settingsCardSub}>Update your display name and account info</div>
                      </div>
                    </div>
                    <div style={SD.settingsCardBody}>
                      {/* Avatar */}
                      <div style={SD.settingsAvatarRow}>
                        <div style={SD.settingsAvatarBig}>{(profileName || displayName || 'U').charAt(0).toUpperCase()}</div>
                        <div>
                          <div style={{ fontSize:14, fontWeight:'600', color:'#374151' }}>{displayName}</div>
                          <div style={{ fontSize:12, color:'#9ca3af', marginTop:2 }}>Student account</div>
                          <div style={{ fontSize:11, color:'#c4b5fd', marginTop:4 }}>Profile photo upload — coming soon</div>
                        </div>
                      </div>
                      <div style={SD.profileField}>
                        <label style={SD.profileLabel}>Display Name</label>
                        <input style={SD.profileInput} value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Your name" maxLength={50} />
                      </div>
                      <div style={SD.profileField}>
                        <label style={SD.profileLabel}>Email</label>
                        <input style={{ ...SD.profileInput, ...SD.profileInputReadonly }} value={user?.email || '—'} readOnly />
                        <div style={{ fontSize:11, color:'#9ca3af', marginTop:3 }}>Email address cannot be changed</div>
                      </div>
                      <div style={SD.profileField}>
                        <label style={SD.profileLabel}>Role</label>
                        <input style={{ ...SD.profileInput, ...SD.profileInputReadonly }} value="Student" readOnly />
                      </div>
                      <button style={SD.profileSaveBtn} onClick={handleProfileSave} disabled={profileSaving}>
                        {profileSaving ? 'Saving…' : 'Save Changes'}
                      </button>
                      {profileMsg && (
                        <div style={{ ...SD.profileMsg, backgroundColor: profileMsg.includes('success') || profileMsg.includes('local') || profileMsg.includes('!') ? '#f0fdf4' : '#fef2f2', color: profileMsg.includes('success') || profileMsg.includes('local') || profileMsg.includes('!') ? '#15803d' : '#dc2626' }}>
                          {profileMsg}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sections 2-4: Coming Soon */}
                  {[
                    { icon:'🔔', title:'Notifications', sub:'Email and push notification preferences' },
                    { icon:'🎨', title:'Preferences',   sub:'Theme, language, and display settings' },
                    { icon:'🔒', title:'Privacy',       sub:'Control your data and privacy settings' },
                  ].map((sec, i) => (
                    <div key={i} style={{ ...SD.settingsCard, marginTop:12 }}>
                      <div style={SD.settingsCardHeader}>
                        <div style={SD.settingsCardIcon}>{sec.icon}</div>
                        <div>
                          <div style={SD.settingsCardTitle}>{sec.title}</div>
                          <div style={SD.settingsCardSub}>{sec.sub}</div>
                        </div>
                      </div>
                      <div style={{ ...SD.settingsCardBody, display:'flex', alignItems:'center', gap:10, padding:'16px 24px' }}>
                        <span style={{ fontSize:20 }}>🚧</span>
                        <span style={{ fontSize:13, color:'#9ca3af', fontWeight:'500' }}>Coming Soon — this section is under development</span>
                      </div>
                    </div>
                  ))}
                </>)}

              </div>
            </div>
          )

        ) : (
          /* ── CHAT VIEW — IDENTICAL ── */
          <>
            <ChatArea messages={messages} currentUserId={getUserId(user)} currentGroup={currentGroup} typingUsers={typingUsers} onMessageEdited={handleMessageEdited} onMessageDeleted={handleMessageDeleted} />
            <MessageInput onSendMessage={handleSendMessage} onTyping={handleTyping} onStopTyping={handleStopTyping} disabled={!currentGroup || !currentGroup.isActive} isAdmin={isAdmin} members={currentGroup.members || []} />
          </>
        )}
      </div>
    </div>
  );
}

export default App;
