import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const ACCENTS = {
  sage:  { main:'oklch(58% 0.09 148)', light:'oklch(91% 0.04 148)', bg:'oklch(97% 0.015 148)' },
  peach: { main:'oklch(70% 0.08 40)',  light:'oklch(93% 0.03 40)',  bg:'oklch(97% 0.015 40)'  },
  pink:  { main:'oklch(66% 0.08 355)', light:'oklch(90% 0.04 355)', bg:'oklch(97% 0.015 355)' },
  sky:   { main:'oklch(62% 0.07 218)', light:'oklch(92% 0.03 218)', bg:'oklch(97% 0.015 218)' },
}

const DIFF_ACCENT = { '초급': 'sage', '중급': 'peach', '고급': 'pink' }
const DIFF_EMOJI  = { '초급': '🌿', '중급': '🔥', '고급': '💪' }

const SP = {
  text1: 'oklch(22% 0.03 20)',
  text2: 'oklch(48% 0.04 20)',
  text3: 'oklch(66% 0.03 20)',
  cream: 'oklch(97% 0.01 70)',
  divider: 'oklch(92% 0.02 70)',
}

const AVATAR_COLORS = [ACCENTS.sage.main, ACCENTS.sky.main, ACCENTS.pink.main, ACCENTS.peach.main]

function AvatarStack({ participants }) {
  const items = participants?.slice(0, 4) || []
  const extra = (participants?.length ?? 0) - 4
  return (
    <div style={{ display:'flex', alignItems:'center' }}>
      {items.map((p, i) => (
        <div key={p.user_id ?? i} style={{
          width:22, height:22, borderRadius:'50%',
          background: AVATAR_COLORS[i % AVATAR_COLORS.length],
          border:'2px solid white',
          marginLeft: i > 0 ? -7 : 0,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:8, fontWeight:700, color:'white',
          zIndex: 4 - i, position:'relative',
        }}>
          {(p.user_name || '?')[0].toUpperCase()}
        </div>
      ))}
      {extra > 0 && (
        <div style={{
          width:22, height:22, borderRadius:'50%',
          background:'oklch(88% 0.03 20)', border:'2px solid white',
          marginLeft:-7, display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:8, fontWeight:700, color:SP.text2, zIndex:0, position:'relative',
        }}>+{extra}</div>
      )}
    </div>
  )
}

export default function MeetingCard({ meeting, userId, onJoinToggle, isPast }) {
  const navigate = useNavigate()
  const [pressed, setPressed] = useState(false)

  const participantCount = meeting.meeting_participants?.length ?? 0
  const isJoined = meeting.meeting_participants?.some(p => p.user_id === userId)
  const isFull = participantCount >= meeting.max_participants
  const pct = meeting.max_participants > 0 ? (participantCount / meeting.max_participants) * 100 : 0
  const remaining = meeting.max_participants - participantCount

  const acc = ACCENTS[DIFF_ACCENT[meeting.difficulty]] ?? ACCENTS.sage
  const emoji = DIFF_EMOJI[meeting.difficulty] ?? '🚴'

  const dateStr = new Date(meeting.date).toLocaleDateString('ko-KR', {
    month:'long', day:'numeric', weekday:'short',
  })

  const chips = [
    { icon:'📅', label:`${dateStr} ${meeting.time?.slice(0,5) ?? ''}` },
    { icon:'📍', label: meeting.location },
    { icon:'🚴', label: meeting.distance },
  ].filter(c => c.label)

  return (
    <div
      onClick={() => navigate(`/meeting/${meeting.id}`)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        borderRadius:22, overflow:'hidden', background:'white',
        boxShadow: isPast
          ? '0 1px 6px rgba(0,0,0,0.06)'
          : `0 4px 22px ${acc.main}25, 0 1px 4px rgba(0,0,0,0.05)`,
        border:`1px solid ${acc.light}`,
        transform: pressed ? 'scale(0.985)' : 'scale(1)',
        transition:'transform 0.12s ease',
        cursor:'pointer',
        filter: isPast ? 'grayscale(75%)' : 'none',
        opacity: isPast ? 0.65 : 1,
        display:'flex', flexDirection:'column',
        minHeight: 340,
      }}
    >
      {/* ── 헤더 ── */}
      <div style={{
        background:`linear-gradient(135deg, ${acc.light}, ${acc.bg} 70%, white)`,
        padding:'16px 16px 14px',
        position:'relative', overflow:'hidden', flexShrink:0,
      }}>
        {/* 장식 원 */}
        <div style={{position:'absolute',top:-24,right:-24,width:90,height:90,borderRadius:'50%',background:acc.main,opacity:0.12,pointerEvents:'none'}}/>
        <div style={{position:'absolute',top:12,right:46,width:44,height:44,borderRadius:'50%',background:acc.main,opacity:0.07,pointerEvents:'none'}}/>

        {/* 태그 칩 */}
        <div style={{display:'flex',gap:5,flexWrap:'wrap',position:'relative',zIndex:1,marginBottom:8}}>
          <span style={{
            fontSize:10, fontWeight:600, color:acc.main,
            background:`${acc.main}18`, padding:'2px 8px', borderRadius:20,
          }}>#{meeting.difficulty}</span>
          {meeting.distance && (
            <span style={{
              fontSize:10, fontWeight:600, color:acc.main,
              background:`${acc.main}18`, padding:'2px 8px', borderRadius:20,
            }}>#{meeting.distance}</span>
          )}
        </div>

        {/* 제목 + 이모지 */}
        <div style={{position:'relative',zIndex:1,display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:8}}>
          <h3 style={{
            fontSize:18, fontWeight:800, color:SP.text1,
            letterSpacing:'-0.025em', lineHeight:1.25, wordBreak:'keep-all',
            minWidth:0,
          }}>
            {meeting.title}
          </h3>
          <span style={{fontSize:28, flexShrink:0, lineHeight:1}}>{emoji}</span>
        </div>
      </div>

      {/* ── 바디 ── */}
      <div style={{
        padding:'12px 16px 16px',
        flex:1, display:'flex', flexDirection:'column', gap:12,
      }}>
        {/* 정보 칩 */}
        <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
          {chips.map((c, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:4,
              background:SP.cream, borderRadius:20, padding:'5px 10px',
              border:`1px solid ${SP.divider}`,
            }}>
              <span style={{fontSize:11}}>{c.icon}</span>
              <span style={{fontSize:11, fontWeight:500, color:SP.text2}}>{c.label}</span>
            </div>
          ))}
        </div>

        {/* 설명 */}
        {meeting.description && (
          <p style={{
            fontSize:12, color:SP.text2, lineHeight:1.55, margin:0,
            display:'-webkit-box', WebkitLineClamp:2,
            WebkitBoxOrient:'vertical', overflow:'hidden',
          }}>{meeting.description}</p>
        )}

        {/* 구분선 */}
        <div style={{height:1, background:SP.divider}}/>

        {/* 참가자 진행 바 */}
        <div style={{display:'flex', flexDirection:'column', gap:6}}>
          {/* 아바타 + 카운트 */}
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <AvatarStack participants={meeting.meeting_participants}/>
            <span style={{fontSize:12, fontWeight:700, color:SP.text2}}>
              {participantCount}/{meeting.max_participants}명
            </span>
          </div>
          {/* 바 */}
          <div style={{height:6, background:`${acc.main}15`, borderRadius:6, overflow:'hidden'}}>
            <div style={{
              height:'100%', width:`${pct}%`,
              background:`linear-gradient(90deg, ${acc.main}cc, ${acc.main})`,
              borderRadius:6, transition:'width 0.6s ease',
            }}/>
          </div>
          {/* 남은 자리 */}
          <span style={{fontSize:11, fontWeight:600, color: isFull ? '#dc2626' : acc.main}}>
            {isFull ? '🔴 마감된 모임입니다' : `${remaining}자리 남았어요`}
          </span>
        </div>

        {/* CTA 버튼 — 항상 하단 */}
        <div style={{marginTop:'auto'}}>
          {isPast ? (
            <button
              onClick={e => { e.stopPropagation(); navigate(`/meeting/${meeting.id}`) }}
              style={{
                width:'100%', height:44, borderRadius:22,
                background:'oklch(92% 0.02 20)', border:'none',
                color:SP.text3, fontSize:14, fontWeight:700,
                cursor:'pointer', letterSpacing:'-0.01em',
              }}>
              기록 보기
            </button>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); onJoinToggle(meeting, isJoined) }}
              disabled={isFull && !isJoined}
              style={{
                width:'100%', height:44, borderRadius:22, border:'none',
                background: isJoined
                  ? `${acc.main}22`
                  : isFull
                  ? '#e5e7eb'
                  : acc.main,
                color: isJoined ? acc.main : isFull ? '#9ca3af' : '#ffffff',
                outline: isJoined ? `1.5px solid ${acc.main}` : 'none',
                fontSize:14, fontWeight:700, letterSpacing:'-0.01em',
                cursor: isFull && !isJoined ? 'not-allowed' : 'pointer',
                transition:'all 0.2s',
                boxShadow: isJoined || isFull ? 'none' : `0 4px 14px ${acc.main}55`,
              }}>
              {isJoined ? '✓ 참가 중' : isFull ? '마감된 모임' : '참가하기'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
