import { useState, useEffect, useRef, useCallback } from 'react'
import { parseReceiptImage, getAIAdvice, fetchCurrentDeals } from './api/yandex'

const CATS = {
  food:          { label:'Продукты',         icon:'🛒', color:'#4ade80' },
  cafe:          { label:'Кафе/рестораны',   icon:'☕', color:'#fb923c' },
  transport:     { label:'Транспорт/бензин', icon:'⛽', color:'#60a5fa' },
  health:        { label:'Здоровье',         icon:'💊', color:'#f472b6' },
  entertainment: { label:'Развлечения',      icon:'🎬', color:'#a78bfa' },
  clothes:       { label:'Одежда',           icon:'👗', color:'#fbbf24' },
  home:          { label:'Дом и быт',        icon:'🏠', color:'#34d399' },
  other:         { label:'Прочее',           icon:'📦', color:'#94a3b8' },
}
const SUBCATS = ['мясо','молочное','хлеб','овощи','фрукты','крупы','напитки','сладкое','рыба','другое']

const DEMO = [
  { id:1, date:'2025-05-10', store:'Магнит',         amount:262.84, category:'food',      subcategory:'молочное', items:['Хлеб крестьянский (хлеб)','Яйцо С2 10шт','Крупа гречневая (крупы)','Кефир 1% (молочное)','Колбаса (мясо)'] },
  { id:2, date:'2025-05-10', store:'Лукойл АЗС',     amount:3200,   category:'transport', subcategory:'',         items:['Бензин АИ-95 40.5л'] },
  { id:3, date:'2025-05-09', store:'Золотой глобус',  amount:1570,   category:'cafe',      subcategory:'',         items:['Азу из свинины','Бутерброд с икрой','Вино Алазанская Долина'] },
  { id:4, date:'2025-05-08', store:'Магазин',         amount:519.19, category:'food',      subcategory:'рыба',     items:['Белуга х/к 1.853кг (рыба)','Бонаква 0.5л (напитки)'] },
  { id:5, date:'2025-05-07', store:'Перекрёсток',    amount:1870,   category:'food',      subcategory:'молочное', items:['Сыр Российский (молочное)','Йогурт Danone (молочное)','Яблоки 1кг (фрукты)'] },
]

const DB = {
  users:    { 'demo@mail.ru': { name:'Демо Пользователь', password:'demo123' } },
  expenses: { 'demo@mail.ru': JSON.parse(JSON.stringify(DEMO)) },
}

const fmt   = n => Number(n).toLocaleString('ru-RU') + ' ₽'
const today = () => new Date().toISOString().split('T')[0]

// ─── HOOKS ────────────────────────────────────────────────────────────────────

function useAuth() {
  const [user, setUser] = useState(null)
  const [page, setPage] = useState('landing')
  const login = (email, pass) => {
    const key = email.trim().toLowerCase()
    const u   = DB.users[key]
    if (!u)                return 'Пользователь не найден'
    if (u.password !== pass) return 'Неверный пароль'
    setUser({ email: key, name: u.name }); return null
  }
  const register = (name, email, pass, pass2) => {
    if (!name.trim())          return 'Введите имя'
    if (!email.includes('@'))  return 'Некорректный email'
    if (pass.length < 6)       return 'Пароль минимум 6 символов'
    if (pass !== pass2)        return 'Пароли не совпадают'
    const key = email.trim().toLowerCase()
    if (DB.users[key])         return 'Email уже зарегистрирован'
    DB.users[key] = { name: name.trim(), password: pass }
    DB.expenses[key] = []
    setUser({ email: key, name: name.trim() }); return null
  }
  const logout = () => { setUser(null); setPage('landing') }
  return { user, page, setPage, login, register, logout }
}

function useExpenses(email) {
  const [list, setList] = useState([])
  useEffect(() => { if (email) setList([...(DB.expenses[email] || [])]) }, [email])
  const add = useCallback(exp => {
    if (!email) return
    DB.expenses[email] = [exp, ...(DB.expenses[email] || [])]
    setList([...DB.expenses[email]])
  }, [email])
  return { list, add }
}

// ─── S (shorthand style helper) ───────────────────────────────────────────────
const S = obj => obj

// ─── LANDING ──────────────────────────────────────────────────────────────────

function LandingPage({ onLogin, onRegister }) {
  const reviews = [
    { name:'Алексей Морозов',    role:'Водитель',         av:'АМ', text:'Показало что трачу 18 000 ₽/мес на бензин. Сменил АЗС — экономлю 2 400 ₽.' },
    { name:'Екатерина Соколова', role:'Мама троих детей', av:'ЕС', text:'Планирую список покупок — экономлю 6 000 ₽ в месяц на продуктах.' },
    { name:'Дмитрий Захаров',    role:'Менеджер',         av:'ДЗ', text:'12 000 ₽/мес в кафе! ИИ дал совет — готовлю дома, экономлю 4 500 ₽.' },
    { name:'Ольга Петрова',      role:'Студентка',        av:'ОП', text:'Узнала про акции в Магните. Теперь откладываю 5 000 ₽ каждый месяц.' },
    { name:'Иван Кузнецов',      role:'ИП',               av:'ИК', text:'Аналитика открыла глаза. Корпоративные расходы сократил на 20%.' },
    { name:'Марина Волкова',     role:'Бухгалтер',        av:'МВ', text:'ИИ на Yandex работает быстро. Советы конкретные, с реальными цифрами.' },
  ]
  const H = S({display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid var(--br)',position:'sticky',top:0,background:'rgba(13,15,20,.96)',backdropFilter:'blur(12px)',zIndex:50})
  return (
    <div style={{background:'var(--bg)',minHeight:'100vh'}}>
      <header style={H}>
        <div className="logo-grad" style={{fontSize:18}}>ReceiptAI</div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={onLogin}     style={{padding:'8px 18px',borderRadius:30,border:'1px solid var(--br)',background:'transparent',color:'var(--tx)',fontFamily:'var(--fb)',fontSize:13,cursor:'pointer'}}>Войти</button>
          <button onClick={onRegister}  style={{padding:'8px 18px',borderRadius:30,border:'none',background:'linear-gradient(135deg,var(--acc),var(--acc2))',color:'#0d0f14',fontFamily:'var(--fb)',fontSize:13,fontWeight:700,cursor:'pointer'}}>Регистрация</button>
        </div>
      </header>

      {/* Hero */}
      <section style={{padding:'52px 20px 40px',textAlign:'center',maxWidth:640,margin:'0 auto'}}>
        <div style={{display:'inline-block',fontSize:11,fontWeight:600,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--acc)',background:'rgba(110,231,183,.1)',border:'1px solid rgba(110,231,183,.2)',padding:'5px 14px',borderRadius:30,marginBottom:20}}>✦ На базе Yandex Cloud AI</div>
        <h1 style={{fontFamily:'var(--fd)',fontSize:'clamp(22px,5vw,38px)',fontWeight:800,lineHeight:1.25,marginBottom:14,background:'linear-gradient(160deg,#fff 40%,var(--acc))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Фотографируйте чеки —<br/>экономьте реальные деньги</h1>
        <p style={{fontSize:14,color:'var(--tx2)',lineHeight:1.75,marginBottom:26,maxWidth:480,margin:'0 auto 26px'}}>ReceiptAI использует YandexVision для распознавания чеков и YandexGPT для анализа расходов. Полностью российский сервис. Сэкономьте от <strong style={{color:'var(--acc)'}}>5 000 до 15 000 ₽</strong> в месяц.</p>
        <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap',marginBottom:28}}>
          <button onClick={onRegister} style={{padding:'13px 26px',borderRadius:30,border:'none',background:'linear-gradient(135deg,var(--acc),var(--acc2))',color:'#0d0f14',fontFamily:'var(--fb)',fontSize:14,fontWeight:700,cursor:'pointer',boxShadow:'0 8px 26px rgba(110,231,183,.3)'}}>Начать бесплатно →</button>
          <button onClick={onLogin}    style={{padding:'13px 22px',borderRadius:30,border:'1px solid var(--br)',background:'transparent',color:'var(--tx2)',fontFamily:'var(--fb)',fontSize:14,cursor:'pointer'}}>Уже есть аккаунт</button>
        </div>
        <div style={{display:'flex',background:'var(--s)',border:'1px solid var(--br)',borderRadius:16,padding:'14px 20px',maxWidth:440,margin:'0 auto'}}>
          {[['YandexVision','OCR распознавание'],['YandexGPT','Анализ и советы'],['🇷🇺','Российский сервис']].map(([n,l],i)=>(
            <div key={i} style={{flex:1,textAlign:'center',padding:'0 10px',borderLeft:i>0?'1px solid var(--br)':'none'}}>
              <div style={{fontFamily:'var(--fd)',fontSize:14,fontWeight:700,color:'var(--acc)',marginBottom:3}}>{n}</div>
              <div style={{fontSize:10,color:'var(--tx2)'}}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{padding:'40px 20px',maxWidth:760,margin:'0 auto'}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--acc)',marginBottom:8}}>ВОЗМОЖНОСТИ</div>
        <h2 style={{fontFamily:'var(--fd)',fontSize:'clamp(17px,3.5vw,26px)',fontWeight:700,marginBottom:24}}>Всё для контроля бюджета</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12}}>
          {[
            {ico:'📸',t:'Распознавание чеков',   d:'YandexVision читает текст с фото. Работает с любыми чеками на русском языке.'},
            {ico:'🥩',t:'Детализация продуктов', d:'Мясо, молоко, хлеб, овощи — разбивка по видам, а не просто «Продукты».'},
            {ico:'🏷️',t:'Акции магазинов',       d:'YandexGPT генерирует актуальные акции из Магнита, Пятёрочки, Перекрёстка.'},
            {ico:'⛽',t:'Сравнение АЗС',         d:'Цены на топливо по сетям. Считаем вашу экономию при смене заправки.'},
            {ico:'🤖',t:'ИИ-советы',             d:'Конкретные рекомендации с суммами экономии на основе ваших реальных трат.'},
            {ico:'🇷🇺',t:'100% российский стек', d:'YandexVision + YandexGPT. Данные не уходят за рубеж. Работает без VPN.'},
          ].map(f=>(
            <div key={f.t} style={{background:'var(--s)',border:'1px solid var(--br)',borderRadius:16,padding:'18px 14px'}}>
              <div style={{fontSize:28,marginBottom:9}}>{f.ico}</div>
              <div style={{fontFamily:'var(--fd)',fontSize:12,fontWeight:700,marginBottom:6}}>{f.t}</div>
              <div style={{fontSize:12,color:'var(--tx2)',lineHeight:1.6}}>{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Reviews */}
      <section style={{padding:'40px 20px',background:'var(--s)'}}>
        <div style={{maxWidth:760,margin:'0 auto'}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--acc)',marginBottom:8}}>ОТЗЫВЫ</div>
          <h2 style={{fontFamily:'var(--fd)',fontSize:'clamp(17px,3.5vw,26px)',fontWeight:700,marginBottom:24}}>Что говорят пользователи</h2>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
            {reviews.map(r=>(
              <div key={r.name} style={{background:'var(--bg)',border:'1px solid var(--br)',borderRadius:16,padding:16}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                  <div style={{width:38,height:38,borderRadius:'50%',background:'linear-gradient(135deg,var(--acc),var(--acc2))',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fd)',fontSize:12,fontWeight:700,color:'#0d0f14',flexShrink:0}}>{r.av}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:13}}>{r.name}</div>
                    <div style={{fontSize:10,color:'var(--tx2)'}}>{r.role}</div>
                  </div>
                  <div style={{color:'#fbbf24',fontSize:12}}>★★★★★</div>
                </div>
                <p style={{fontSize:12,color:'var(--tx2)',lineHeight:1.7,fontStyle:'italic'}}>«{r.text}»</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{padding:'52px 20px',textAlign:'center',borderTop:'1px solid var(--br)'}}>
        <h2 style={{fontFamily:'var(--fd)',fontSize:'clamp(17px,3.5vw,26px)',fontWeight:800,marginBottom:10}}>Начните экономить уже сегодня</h2>
        <p style={{color:'var(--tx2)',fontSize:13,marginBottom:22}}>Регистрация бесплатная. Первый чек — через 30 секунд.</p>
        <button onClick={onRegister} style={{padding:'13px 28px',borderRadius:30,border:'none',background:'linear-gradient(135deg,var(--acc),var(--acc2))',color:'#0d0f14',fontFamily:'var(--fb)',fontSize:14,fontWeight:700,cursor:'pointer',boxShadow:'0 8px 26px rgba(110,231,183,.3)'}}>Создать аккаунт бесплатно</button>
        <p style={{marginTop:14,fontSize:12,color:'var(--tx2)'}}>Уже есть аккаунт? <span onClick={onLogin} style={{color:'var(--acc)',cursor:'pointer',fontWeight:600}}>Войти</span></p>
      </section>
      <footer style={{padding:'20px',textAlign:'center',borderTop:'1px solid var(--br)'}}>
        <div className="logo-grad" style={{fontSize:14}}>ReceiptAI</div>
        <p style={{fontSize:11,color:'var(--br)',marginTop:5}}>© 2025 ReceiptAI · На базе Yandex Cloud AI</p>
      </footer>
    </div>
  )
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

function AuthWrap({ title, onBack, children }) {
  return (
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'24px 18px',background:'var(--bg)'}}>
      <div className="logo-grad" style={{fontSize:22,marginBottom:20}}>ReceiptAI</div>
      <div style={{width:'100%',maxWidth:360,background:'var(--s)',border:'1px solid var(--br)',borderRadius:16,padding:'22px 20px'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
          <button onClick={onBack} style={{background:'none',border:'none',color:'var(--tx2)',fontSize:20,cursor:'pointer',lineHeight:1,padding:'0 4px'}}>←</button>
          <h2 style={{fontFamily:'var(--fd)',fontSize:15,fontWeight:700}}>{title}</h2>
        </div>
        {children}
      </div>
    </div>
  )
}

function LoginScreen({ onLogin, onReg, onBack }) {
  const [email,setEmail]=useState(''); const [pass,setPass]=useState(''); const [err,setErr]=useState('')
  const go=()=>{ const e=onLogin(email,pass); if(e) setErr(e) }
  return (
    <AuthWrap title="Вход" onBack={onBack}>
      <label className="lbl">Email</label>
      <input className="inp" type="email" placeholder="you@mail.ru" value={email} onChange={e=>{setEmail(e.target.value);setErr('')}}/>
      <label className="lbl">Пароль</label>
      <input className="inp" type="password" placeholder="••••••" value={pass} onChange={e=>{setPass(e.target.value);setErr('')}} onKeyDown={e=>e.key==='Enter'&&go()}/>
      <button className="btn-g" style={{marginTop:16}} onClick={go}>Войти</button>
      {err&&<div className="err">{err}</div>}
      <div style={{marginTop:14,padding:10,background:'rgba(110,231,183,.06)',border:'1px dashed rgba(110,231,183,.2)',borderRadius:10,fontSize:12,color:'var(--tx2)',textAlign:'center',lineHeight:1.7}}>Демо: <strong>demo@mail.ru</strong> / <strong>demo123</strong></div>
      <div style={{marginTop:14,fontSize:12,color:'var(--tx2)',textAlign:'center'}}>Нет аккаунта? <span onClick={onReg} style={{color:'var(--acc)',cursor:'pointer',fontWeight:600}}>Зарегистрироваться</span></div>
    </AuthWrap>
  )
}

function RegisterScreen({ onReg, onLogin, onBack }) {
  const [f,setF]=useState({name:'',email:'',pass:'',pass2:''}); const [err,setErr]=useState('')
  const upd=k=>e=>{setF(p=>({...p,[k]:e.target.value}));setErr('')}
  const go=()=>{ const e=onReg(f.name,f.email,f.pass,f.pass2); if(e) setErr(e) }
  return (
    <AuthWrap title="Регистрация" onBack={onBack}>
      {[['Имя','name','text','Иван Петров'],['Email','email','email','you@mail.ru'],['Пароль','pass','password','мин. 6 символов'],['Повтор','pass2','password','••••••']].map(([l,k,t,ph])=>(
        <div key={k}><label className="lbl">{l}</label><input className="inp" type={t} placeholder={ph} value={f[k]} onChange={upd(k)} onKeyDown={e=>e.key==='Enter'&&go()}/></div>
      ))}
      <button className="btn-g" style={{marginTop:16}} onClick={go}>Создать аккаунт</button>
      {err&&<div className="err">{err}</div>}
      <div style={{marginTop:14,fontSize:12,color:'var(--tx2)',textAlign:'center'}}>Есть аккаунт? <span onClick={onLogin} style={{color:'var(--acc)',cursor:'pointer',fontWeight:600}}>Войти</span></div>
    </AuthWrap>
  )
}

// ─── UPLOAD ───────────────────────────────────────────────────────────────────

function UploadScreen({ onDone }) {
  const [file,setFile]=useState(null); const [prev,setPrev]=useState(null)
  const [load,setLoad]=useState(false); const [err,setErr]=useState('')
  const [mode,setMode]=useState('photo')
  const [md,setMd]=useState({store:'',amount:'',category:'food',subcategory:'другое',date:'',items:''})
  const ref=useRef()

  const pickFile=f=>{
    if(!f)return
    if(!f.type.startsWith('image/')){setErr('Выберите изображение');return}
    setFile(f);setErr('')
    const r=new FileReader();r.onload=e=>setPrev(e.target.result);r.readAsDataURL(f)
  }

  const scanPhoto=async()=>{
    setLoad(true);setErr('')
    try{ onDone({id:Date.now(),isNew:true,...await parseReceiptImage(file)}) }
    catch(e){ setErr(e.message) }
    setLoad(false)
  }

  const saveManual=()=>{
    const amount=parseFloat(String(md.amount).replace(',','.'))
    if(!md.store.trim()){setErr('Введите название магазина');return}
    if(!amount||amount<=0){setErr('Введите корректную сумму');return}
    const items=md.items.split('\n').map(s=>s.trim()).filter(Boolean)
    onDone({id:Date.now(),isNew:true,store:md.store.trim(),amount,date:md.date||today(),category:md.category,subcategory:md.subcategory,items})
  }

  if(mode==='manual') return(
    <div style={{padding:'18px 16px'}}>
      <div style={{textAlign:'center',marginBottom:16}}>
        <span style={{fontSize:40,display:'block',marginBottom:7}}>✏️</span>
        <h2 style={{fontFamily:'var(--fd)',fontSize:16,fontWeight:700,marginBottom:4}}>Ввод вручную</h2>
      </div>
      <label className="lbl">Магазин *</label>
      <input className="inp" placeholder="Магнит" value={md.store} onChange={e=>setMd(p=>({...p,store:e.target.value}))}/>
      <label className="lbl">Сумма (₽) *</label>
      <input className="inp" type="number" placeholder="519.19" value={md.amount} onChange={e=>setMd(p=>({...p,amount:e.target.value}))}/>
      <label className="lbl">Категория</label>
      <select className="inp" value={md.category} onChange={e=>setMd(p=>({...p,category:e.target.value}))}>
        {Object.entries(CATS).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
      </select>
      {md.category==='food'&&<>
        <label className="lbl">Подкатегория</label>
        <select className="inp" value={md.subcategory} onChange={e=>setMd(p=>({...p,subcategory:e.target.value}))}>
          {SUBCATS.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </>}
      <label className="lbl">Дата</label>
      <input className="inp" type="date" value={md.date} onChange={e=>setMd(p=>({...p,date:e.target.value}))}/>
      <label className="lbl">Товары (каждый с новой строки)</label>
      <textarea className="inp" rows={4} placeholder={'Молоко 1л\nХлеб ржаной'} value={md.items} onChange={e=>setMd(p=>({...p,items:e.target.value}))}/>
      {err&&<div className="err">{err}</div>}
      <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:14}}>
        <button className="btn-g" onClick={saveManual}>✓ Сохранить</button>
        <button className="btn-ghost" onClick={()=>{setMode('photo');setErr('')}}>← Назад</button>
      </div>
    </div>
  )

  return(
    <div style={{padding:'18px 16px'}}>
      <div style={{textAlign:'center',marginBottom:16}}>
        <span style={{fontSize:42,display:'block',marginBottom:7}}>📸</span>
        <h2 style={{fontFamily:'var(--fd)',fontSize:16,fontWeight:700,marginBottom:4}}>Добавить чек</h2>
        <p style={{color:'var(--tx2)',fontSize:12}}>YandexVision распознает текст с фото</p>
      </div>
      <div style={{border:`2px dashed ${prev?'var(--acc)':'var(--br)'}`,borderRadius:16,minHeight:155,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',background:'var(--s)',overflow:'hidden',marginBottom:11,transition:'border-color .25s'}}
        onClick={()=>ref.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();pickFile(e.dataTransfer.files[0])}}>
        {prev
          ?<img src={prev} alt="чек" style={{width:'100%',maxHeight:240,objectFit:'contain',borderRadius:10}}/>
          :<div style={{textAlign:'center',padding:22}}>
            <div style={{fontSize:40,marginBottom:8}}>🧾</div>
            <p style={{color:'var(--tx2)',fontSize:13,marginBottom:5}}>Нажмите чтобы выбрать фото</p>
            <span style={{fontSize:10,color:'var(--br)'}}>JPG · PNG · HEIC · до 10 МБ</span>
          </div>}
        <input ref={ref} type="file" accept="image/*" hidden onChange={e=>pickFile(e.target.files[0])}/>
      </div>
      {!prev&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:11}}>
        {['📷 Параллельно чеку','💡 Без теней','📄 Весь чек в кадре','🔍 ИТОГ должен быть виден'].map((t,i)=>(
          <div key={i} style={{background:'var(--s)',border:'1px solid var(--br)',borderRadius:10,padding:'7px 9px',fontSize:11,color:'var(--tx2)',lineHeight:1.4}}>{t}</div>
        ))}
      </div>}
      {err&&<div className="err">{err}</div>}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {file&&<button className="btn-g" onClick={scanPhoto} disabled={load}>
          {load?<><span className="spin"/> Распознаю через YandexVision...</>:<>✨ Распознать чек</>}
        </button>}
        {file&&<button className="btn-ghost" onClick={()=>{setFile(null);setPrev(null);setErr('')}}>🔄 Другое фото</button>}
        <button className="btn-acc" onClick={()=>{setMode('manual');setErr('')}}>✏️ Ввести вручную</button>
      </div>
    </div>
  )
}

// ─── EXPENSES ─────────────────────────────────────────────────────────────────

function ExpCard({e}){
  const cat=CATS[e.category]||CATS.other
  return(
    <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--s)',borderRadius:10,padding:11,marginBottom:7,border:e.isNew?'1px solid var(--acc)':'1px solid transparent',animation:e.isNew?'slideUp .4s ease':'none'}}>
      <div style={{width:38,height:38,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,flexShrink:0,background:cat.color+'20',color:cat.color}}>{cat.icon}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{e.store}</div>
        <div style={{display:'flex',gap:7,alignItems:'center',marginBottom:2}}>
          <span style={{fontSize:10,color:'var(--tx2)'}}>{cat.label}{e.subcategory&&e.category==='food'?' · '+e.subcategory:''}</span>
          <span style={{fontSize:10,color:'var(--br)'}}>{new Date(e.date).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}</span>
        </div>
        {e.items?.length>0&&<div style={{fontSize:10,color:'var(--tx2)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{e.items.slice(0,3).join(', ')}{e.items.length>3?'…':''}</div>}
      </div>
      <div style={{fontFamily:'var(--fd)',fontSize:13,fontWeight:600,flexShrink:0}}>{fmt(e.amount)}</div>
    </div>
  )
}

function ExpensesScreen({list}){
  const grouped={}
  list.forEach(e=>{if(!grouped[e.date])grouped[e.date]=[];grouped[e.date].push(e)})
  const dates=Object.keys(grouped).sort((a,b)=>b.localeCompare(a))
  return(
    <div style={{padding:16}}>
      <div style={{marginBottom:14}}>
        <h2 style={{fontFamily:'var(--fd)',fontSize:16,fontWeight:700,marginBottom:2}}>Мои расходы</h2>
        <p style={{color:'var(--tx2)',fontSize:11}}>{list.length} чеков · май 2025</p>
      </div>
      {list.length===0&&<div style={{textAlign:'center',padding:'50px 20px',color:'var(--tx2)'}}>
        <div style={{fontSize:44,marginBottom:10}}>🧾</div>
        <p style={{lineHeight:1.7,fontSize:14}}>Чеков пока нет.<br/>Нажмите 📸 чтобы добавить первый!</p>
      </div>}
      {dates.map(d=>(
        <div key={d} style={{marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--tx2)',marginBottom:8}}>{new Date(d).toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})}</div>
          {grouped[d].map(e=><ExpCard key={e.id} e={e}/>)}
        </div>
      ))}
    </div>
  )
}

// ─── DEALS ────────────────────────────────────────────────────────────────────

function DealsScreen(){
  const [deals,setDeals]=useState([]); const [load,setLoad]=useState(false); const [loaded,setLoaded]=useState(false); const [filter,setFilter]=useState('все')
  const loadDeals=async()=>{
    setLoad(true)
    try{ const d=await fetchCurrentDeals(); setDeals(d); setLoaded(true) }catch{}
    setLoad(false)
  }
  const cats=['все',...new Set(deals.map(d=>d.category))]
  const shown=filter==='все'?deals:deals.filter(d=>d.category===filter)
  return(
    <div style={{padding:16}}>
      <div style={{marginBottom:14}}>
        <h2 style={{fontFamily:'var(--fd)',fontSize:16,fontWeight:700,marginBottom:2}}>🏷️ Акции магазинов</h2>
        <p style={{color:'var(--tx2)',fontSize:11}}>Генерируются YandexGPT · актуальные на сегодня</p>
      </div>
      {!loaded&&!load&&<div style={{textAlign:'center',padding:'40px 20px'}}>
        <div style={{fontSize:44,marginBottom:12}}>🏷️</div>
        <p style={{color:'var(--tx2)',fontSize:14,marginBottom:20,lineHeight:1.7}}>Загрузить актуальные акции<br/>из Магнита, Пятёрочки, Перекрёстка</p>
        <button className="btn-g" style={{maxWidth:260,margin:'0 auto'}} onClick={loadDeals}>Загрузить акции</button>
      </div>}
      {load&&<div style={{textAlign:'center',padding:'40px 20px'}}>
        <div className="dots"><span/><span/><span/></div>
        <p style={{color:'var(--tx2)',fontSize:13}}>YandexGPT ищет акции…</p>
      </div>}
      {loaded&&!load&&<>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
          {cats.map(c=><button key={c} onClick={()=>setFilter(c)} style={{padding:'5px 12px',borderRadius:20,border:'1px solid',borderColor:filter===c?'var(--acc)':'var(--br)',background:filter===c?'rgba(110,231,183,.1)':'transparent',color:filter===c?'var(--acc)':'var(--tx2)',fontFamily:'var(--fb)',fontSize:12,cursor:'pointer'}}>{c}</button>)}
        </div>
        {shown.map((d,i)=>(
          <div key={i} style={{background:'var(--s)',border:'1px solid var(--br)',borderRadius:12,padding:14,marginBottom:9,display:'flex',alignItems:'center',gap:12}}>
            <div style={{background:'rgba(110,231,183,.1)',borderRadius:10,padding:'8px 10px',flexShrink:0,textAlign:'center',minWidth:56}}>
              <div style={{fontFamily:'var(--fd)',fontSize:16,fontWeight:800,color:'var(--acc)'}}>{d.discount}</div>
              <div style={{fontSize:10,color:'var(--tx2)',marginTop:2}}>скидка</div>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,color:'var(--acc2)',fontWeight:600,marginBottom:3}}>{d.store}</div>
              <div style={{fontSize:13,fontWeight:600,marginBottom:3,lineHeight:1.3}}>{d.product}</div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span style={{fontSize:14,fontWeight:700,color:'var(--acc)',fontFamily:'var(--fd)'}}>{d.newPrice} ₽</span>
                <span style={{fontSize:12,color:'var(--tx2)',textDecoration:'line-through'}}>{d.oldPrice} ₽</span>
                <span style={{fontSize:10,color:'var(--tx2)',marginLeft:'auto'}}>до {d.until}</span>
              </div>
            </div>
          </div>
        ))}
        <button className="btn-ghost" style={{marginTop:8}} onClick={loadDeals}>↻ Обновить акции</button>
      </>}
    </div>
  )
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

function AnalyticsScreen({list}){
  const [advice,setAdvice]=useState(''); const [aLoad,setALoad]=useState(false); const [aReady,setAReady]=useState(false)
  const byC={};let total=0
  list.forEach(e=>{byC[e.category]=(byC[e.category]||0)+e.amount;total+=e.amount})
  const bySub={}
  list.filter(e=>e.category==='food').forEach(e=>{const sc=e.subcategory||'другое';bySub[sc]=(bySub[sc]||0)+e.amount})
  const sorted=Object.entries(byC).sort((a,b)=>b[1]-a[1]); const maxV=sorted[0]?.[1]||1
  const fetchAdvice=async()=>{
    setALoad(true);setAdvice('');setAReady(false)
    try{ const d=await fetchCurrentDeals().catch(()=>[]); setAdvice(await getAIAdvice(list,d)) }catch(e){setAdvice('Ошибка: '+e.message)}
    setALoad(false);setAReady(true)
  }
  return(
    <div style={{padding:16}}>
      <div style={{background:'var(--s)',borderRadius:16,padding:16,marginBottom:12}}>
        <div style={{display:'inline-block',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'.1em',color:'var(--acc)',background:'rgba(110,231,183,.1)',padding:'3px 9px',borderRadius:20,marginBottom:8}}>Май 2025</div>
        <p style={{fontSize:11,color:'var(--tx2)',marginBottom:4}}>Потрачено за месяц</p>
        <p style={{fontFamily:'var(--fd)',fontSize:26,fontWeight:700}}>{fmt(total)}</p>
      </div>
      {byC.transport>0&&<div style={{background:'linear-gradient(135deg,rgba(96,165,250,.08),rgba(56,189,248,.05))',border:'1px solid rgba(96,165,250,.2)',borderRadius:16,padding:14,marginBottom:11}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
          <span style={{fontSize:26}}>⛽</span>
          <div><div style={{fontSize:11,color:'var(--tx2)',marginBottom:2}}>Расходы на топливо</div><div style={{fontFamily:'var(--fd)',fontSize:17,fontWeight:700,color:'var(--acc2)'}}>{fmt(byC.transport)}</div></div>
        </div>
        <div style={{fontSize:11,color:'var(--tx2)',background:'rgba(56,189,248,.07)',borderRadius:10,padding:'8px 10px',marginBottom:8,lineHeight:1.6}}>💡 Смените АЗС — экономия до 4 ₽/л</div>
        {[['🔵','Татнефть','~54'],['🟠','Роснефть','~55'],['🔴','Лукойл','~56'],['🟢','Газпромнефть','~57']].map(([ico,n,p])=>(
          <div key={n} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:12,padding:'6px 10px',background:'rgba(255,255,255,.03)',borderRadius:8,marginBottom:5}}>
            <span>{ico} {n}</span><span style={{fontWeight:600,color:'var(--acc)',fontFamily:'var(--fd)',fontSize:11}}>АИ-95 {p} ₽/л</span>
          </div>
        ))}
      </div>}
      {list.length===0
        ?<div style={{textAlign:'center',padding:'40px 20px',color:'var(--tx2)'}}><p>Добавьте чеки чтобы увидеть аналитику</p></div>
        :<>
          <div style={{marginBottom:16}}>
            <h3 style={{fontFamily:'var(--fd)',fontSize:12,fontWeight:700,marginBottom:11}}>По категориям</h3>
            {sorted.map(([c,a])=>{const cat=CATS[c]||CATS.other;return(
              <div key={c} style={{display:'flex',gap:9,alignItems:'flex-start',marginBottom:11}}>
                <span style={{fontSize:20,width:24,flexShrink:0,marginTop:1,color:cat.color}}>{cat.icon}</span>
                <div style={{flex:1}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:500}}>{cat.label}</span>
                    <span style={{fontFamily:'var(--fd)',fontSize:12,fontWeight:600}}>{fmt(a)}</span>
                  </div>
                  <div style={{height:4,background:'var(--s2)',borderRadius:3,overflow:'hidden',marginBottom:3}}>
                    <div style={{height:'100%',borderRadius:3,background:cat.color,width:Math.round(a/maxV*100)+'%',transition:'width .8s ease'}}/>
                  </div>
                  <span style={{fontSize:10,color:'var(--tx2)'}}>{Math.round(a/total*100)}% бюджета</span>
                </div>
              </div>
            )})}
          </div>
          {Object.keys(bySub).length>0&&<div style={{background:'var(--s)',borderRadius:16,padding:14,marginBottom:14}}>
            <h3 style={{fontFamily:'var(--fd)',fontSize:11,fontWeight:700,marginBottom:11}}>🛒 Детализация продуктов</h3>
            {Object.entries(bySub).sort((a,b)=>b[1]-a[1]).map(([sc,a])=>(
              <div key={sc} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid var(--br)'}}>
                <span style={{fontSize:12,textTransform:'capitalize'}}>{sc}</span>
                <span style={{fontFamily:'var(--fd)',fontSize:12,fontWeight:600,color:'var(--acc)'}}>{fmt(a)}</span>
              </div>
            ))}
          </div>}
          <div style={{background:'var(--s)',borderRadius:16,padding:15}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:11}}>
              <h3 style={{fontFamily:'var(--fd)',fontSize:12,fontWeight:700}}>YandexGPT советы</h3>
              <span style={{fontSize:10,fontWeight:700,color:'var(--acc2)',background:'rgba(56,189,248,.1)',padding:'3px 7px',borderRadius:20,border:'1px solid rgba(56,189,248,.2)'}}>✦ AI</span>
            </div>
            {!aReady&&!aLoad&&<button className="btn-ghost" onClick={fetchAdvice}>✨ Получить советы с учётом акций</button>}
            {aLoad&&<div style={{textAlign:'center',padding:'15px 0'}}><div className="dots"><span/><span/><span/></div><p style={{color:'var(--tx2)',fontSize:12}}>YandexGPT анализирует расходы…</p></div>}
            {aReady&&<div>
              {advice.split('\n').filter(l=>l.trim()).map((l,i)=>(
                <div key={i} style={{background:'var(--s2)',borderRadius:10,padding:'10px 12px',borderLeft:'3px solid var(--acc)',marginBottom:7}}>
                  <p style={{fontSize:12,lineHeight:1.65}}>{l}</p>
                </div>
              ))}
              <button className="btn-ghost" style={{marginTop:6,fontSize:11,padding:8}} onClick={fetchAdvice}>↻ Обновить</button>
            </div>}
          </div>
        </>}
    </div>
  )
}

// ─── TIPS ─────────────────────────────────────────────────────────────────────

const TIPS=[
  {icon:'⛽',cat:'Транспорт',title:'Топливо дешевле на 3-5 ₽/л',body:'Татнефть и независимые АЗС дешевле сетевых. Баком 50л — экономия 150-250 ₽ за заправку.',steps:['Сравнивайте цены перед заправкой','Карты лояльности АЗС — скидка 3-7%','Заправляйтесь полным баком','Следите за акционными часами']},
  {icon:'🛒',cat:'Продукты',title:'Список экономит 20-23%',body:'Без списка тратят на 23% больше. Пишите список дома.',steps:['Меню на неделю в воскресенье','Один большой поход вместо ежедневных','Сезонные овощи и фрукты','Цена за 100г, не за упаковку']},
  {icon:'☕',cat:'Кафе',title:'Кофе дома = 3 000-5 000 ₽/мес',body:'Кофе в кофейне — 180-350 ₽. Дома — 15-30 ₽. 5 чашек в неделю — 2 500 ₽ разницы.',steps:['Турка или капсульная кофемашина','Дома хотя бы 3 раза в неделю','Термос — горячий 6 часов','Кафе только для особых случаев']},
  {icon:'🏷️',cat:'Акции',title:'Кешбэк и акции — законная экономия',body:'Покупки с кешбэком дают 5-15% возврата. Вкладка Акции в приложении всегда актуальна.',steps:['Кешбэк через приложение банка','Акции в Магните и Пятёрочке','Непортящееся впрок','Карты лояльности всех магазинов']},
  {icon:'📱',cat:'Подписки',title:'Аудит подписок',body:'Средний человек платит за 4-7 подписок, активно использует 2-3.',steps:['Выписка банка за 3 месяца','Отменить неиспользуемые','Семейные тарифы','Проверять каждые 3 месяца']},
  {icon:'🍽️',cat:'Готовка',title:'Дома дешевле на 40-60%',body:'Обед в кафе — 400-700 ₽. Дома — 80-150 ₽. Рабочая неделя — 1 000-2 750 ₽ экономии.',steps:['Готовьте на 2 дня вперёд','Обед в контейнере на работу','5-7 любимых простых блюд','Batch cooking в воскресенье']},
]

function TipsScreen(){
  const [open,setOpen]=useState(null)
  return(
    <div style={{padding:16}}>
      <div style={{marginBottom:16}}>
        <h2 style={{fontFamily:'var(--fd)',fontSize:15,fontWeight:700,marginBottom:3}}>Советы по экономии</h2>
        <p style={{color:'var(--tx2)',fontSize:11}}>Проверенные способы сократить расходы</p>
      </div>
      {TIPS.map((t,i)=>(
        <div key={i} style={{background:'var(--s)',border:`1px solid ${open===i?'var(--acc)':'var(--br)'}`,borderRadius:16,marginBottom:9,overflow:'hidden',cursor:'pointer',transition:'border-color .2s'}} onClick={()=>setOpen(open===i?null:i)}>
          <div style={{display:'flex',alignItems:'center',gap:11,padding:13}}>
            <div style={{fontSize:26,flexShrink:0,width:32,textAlign:'center'}}>{t.icon}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:10,color:'var(--tx2)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:2}}>{t.cat}</div>
              <div style={{fontSize:13,fontWeight:600}}>{t.title}</div>
            </div>
            <div style={{fontSize:11,color:'var(--tx2)',flexShrink:0}}>{open===i?'▲':'▼'}</div>
          </div>
          {open===i&&<div style={{padding:'0 13px 13px',borderTop:'1px solid var(--br)'}}>
            <p style={{fontSize:13,color:'var(--tx2)',lineHeight:1.65,margin:'11px 0'}}>{t.body}</p>
            {t.steps.map((s,j)=>(
              <div key={j} style={{display:'flex',alignItems:'flex-start',gap:9,fontSize:12,marginBottom:8,lineHeight:1.5}}>
                <span style={{width:20,height:20,borderRadius:'50%',background:'rgba(110,231,183,.15)',color:'var(--acc)',fontSize:10,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>{j+1}</span>
                <span>{s}</span>
              </div>
            ))}
          </div>}
        </div>
      ))}
    </div>
  )
}

// ─── SUCCESS ──────────────────────────────────────────────────────────────────

function SuccessScreen({exp,onDone}){
  const cat=CATS[exp?.category]||CATS.other
  useEffect(()=>{const t=setTimeout(onDone,3500);return()=>clearTimeout(t)},[onDone])
  return(
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'60vh',padding:'30px 16px',textAlign:'center',animation:'fadeIn .35s ease'}}>
      <div style={{width:80,height:80,borderRadius:'50%',border:`3px solid ${cat.color}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:36,marginBottom:16,animation:'popIn .5s cubic-bezier(.175,.885,.32,1.275)'}}>{cat.icon}</div>
      <h2 style={{fontFamily:'var(--fd)',fontSize:18,fontWeight:700,marginBottom:7}}>Чек добавлен!</h2>
      <p style={{color:'var(--tx2)',fontSize:13,marginBottom:5}}>{exp?.store}</p>
      <p style={{fontFamily:'var(--fd)',fontSize:26,fontWeight:700,color:cat.color,marginBottom:3}}>{fmt(exp?.amount||0)}</p>
      <p style={{color:'var(--tx2)',fontSize:12,marginBottom:14}}>{cat.label}{exp?.subcategory?' · '+exp.subcategory:''}</p>
      <div style={{display:'flex',flexWrap:'wrap',gap:5,justifyContent:'center',marginBottom:14}}>
        {exp?.items?.slice(0,5).map((it,i)=><span key={i} style={{background:'var(--s2)',borderRadius:20,padding:'4px 10px',fontSize:11,color:'var(--tx2)'}}>{it}</span>)}
      </div>
      <p style={{fontSize:11,color:'var(--br)'}}>Возврат к списку…</p>
    </div>
  )
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────

function ProfileScreen({user,list,onLogout}){
  const total=list.reduce((s,e)=>s+e.amount,0)
  const ini=(user.name||'').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  return(
    <div style={{padding:16}}>
      <div style={{background:'var(--s)',borderRadius:16,padding:20,marginBottom:11,textAlign:'center'}}>
        <div style={{width:60,height:60,borderRadius:'50%',background:'linear-gradient(135deg,var(--acc),var(--acc2))',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fd)',fontSize:20,fontWeight:700,color:'#0d0f14',margin:'0 auto 11px'}}>{ini}</div>
        <h2 style={{fontFamily:'var(--fd)',fontSize:15,fontWeight:700,marginBottom:3}}>{user.name}</h2>
        <p style={{fontSize:12,color:'var(--tx2)'}}>{user.email}</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:11}}>
        <div style={{background:'var(--s)',borderRadius:16,padding:14,textAlign:'center'}}>
          <div style={{fontFamily:'var(--fd)',fontSize:18,fontWeight:700,color:'var(--acc)',marginBottom:3}}>{list.length}</div>
          <div style={{fontSize:10,color:'var(--tx2)',textTransform:'uppercase',letterSpacing:'.06em'}}>Чеков</div>
        </div>
        <div style={{background:'var(--s)',borderRadius:16,padding:14,textAlign:'center'}}>
          <div style={{fontFamily:'var(--fd)',fontSize:16,fontWeight:700,color:'var(--acc2)',marginBottom:3}}>{fmt(total)}</div>
          <div style={{fontSize:10,color:'var(--tx2)',textTransform:'uppercase',letterSpacing:'.06em'}}>Май 2025</div>
        </div>
      </div>
      <button onClick={onLogout} style={{width:'100%',padding:12,borderRadius:14,border:'1px solid rgba(251,113,133,.3)',background:'rgba(251,113,133,.06)',color:'var(--red)',fontFamily:'var(--fb)',fontSize:13,cursor:'pointer'}}>Выйти из аккаунта</button>
    </div>
  )
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────

export default function App(){
  const {user,page,setPage,login,register,logout}=useAuth()
  const {list,add}=useExpenses(user?.email)
  const [tab,setTab]=useState('expenses')
  const [succ,setSucc]=useState(null)
  const handleDone  =exp=>{add(exp);setSucc(exp)}
  const handleLogout=()=>{logout();setTab('expenses');setSucc(null)}

  if(!user){
    if(page==='landing')  return <LandingPage onLogin={()=>setPage('login')} onRegister={()=>setPage('register')}/>
    if(page==='login')    return <LoginScreen onLogin={(e,p)=>{const err=login(e,p);if(!err)setPage('app');return err}} onReg={()=>setPage('register')} onBack={()=>setPage('landing')}/>
    if(page==='register') return <RegisterScreen onReg={(n,e,p,p2)=>{const err=register(n,e,p,p2);if(!err)setPage('app');return err}} onLogin={()=>setPage('login')} onBack={()=>setPage('landing')}/>
    return null
  }

  const NAV=[
    {id:'expenses', ico:'🧾',lbl:'Чеки'},
    {id:'analytics',ico:'📊',lbl:'Анализ'},
    {id:'add',      ico:'📸',lbl:null,center:true},
    {id:'deals',    ico:'🏷️',lbl:'Акции'},
    {id:'tips',     ico:'💡',lbl:'Советы'},
  ]

  return(
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',display:'flex',flexDirection:'column',background:'var(--bg)'}}>
      <header style={{padding:'13px 16px 0',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div className="logo-grad" style={{fontSize:15}}>ReceiptAI</div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:11,color:'var(--tx2)'}}>{user.name.split(' ')[0]}</span>
          <button onClick={handleLogout} style={{background:'none',border:'1px solid var(--br)',color:'var(--tx2)',fontSize:11,padding:'3px 9px',borderRadius:20,cursor:'pointer',fontFamily:'var(--fb)'}}>Выйти</button>
        </div>
      </header>
      <main style={{flex:1,overflowY:'auto',paddingBottom:80}}>
        {succ?<SuccessScreen exp={succ} onDone={()=>{setSucc(null);setTab('expenses')}}/>
          :tab==='expenses'  ?<ExpensesScreen list={list}/>
          :tab==='add'       ?<UploadScreen onDone={handleDone}/>
          :tab==='analytics' ?<AnalyticsScreen list={list}/>
          :tab==='deals'     ?<DealsScreen/>
          :tab==='tips'      ?<TipsScreen/>
          :null}
      </main>
      {!succ&&<nav style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:480,background:'var(--s)',borderTop:'1px solid var(--br)',display:'flex',alignItems:'flex-end',padding:'7px 6px 12px',gap:1,zIndex:100}}>
        {NAV.map(n=>n.center
          ?<button key="add" onClick={()=>setTab('add')} style={{flex:'0 0 52px',marginTop:-15,height:52,borderRadius:'50%',background:'linear-gradient(135deg,var(--acc),var(--acc2))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:23,border:'none',cursor:'pointer',boxShadow:'0 8px 22px rgba(110,231,183,.3)'}}>📸</button>
          :<button key={n.id} onClick={()=>setTab(n.id)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'6px 0',border:'none',background:'transparent',color:tab===n.id?'var(--acc)':'var(--tx2)',fontFamily:'var(--fb)',fontSize:9,cursor:'pointer',borderRadius:10,backgroundColor:tab===n.id?'rgba(110,231,183,.08)':'transparent'}}>
            <span style={{fontSize:19}}>{n.ico}</span>{n.lbl}
          </button>
        )}
      </nav>}
    </div>
  )
}
