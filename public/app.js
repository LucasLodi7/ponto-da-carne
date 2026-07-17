let settings = null;
let products = [];
let cart = [];
let currentCategory = 'Todos';
let editingProductId = null;
let fulfillment = 'delivery';
const displayQty = {};

/* ============ INIT ============ */
async function init(){
  document.getElementById('year').textContent = new Date().getFullYear();

  const [settingsRes, productsRes] = await Promise.all([
    fetch('/api/settings').then(r=>r.json()),
    fetch('/api/products').then(r=>r.json())
  ]);
  settings = normalizeSettings(settingsRes);
  products = productsRes;

  cart = JSON.parse(localStorage.getItem('ponto-da-carne-cart') || '[]');

  renderSettingsUI();
  renderTabs();
  renderGrid();
  renderCart();
  updateStatus();
  setInterval(updateStatus, 60000);

  // if a session cookie is still valid, skip straight to the admin panel next time they open it
}

function normalizeSettings(s){
  return {
    whatsapp: s.whatsapp,
    instagram: s.instagram,
    address: s.address,
    deliveryFee: s.delivery_fee,
    freeThreshold: s.free_threshold,
    hours: { week: s.hours_week, sat: s.hours_sat, sun: s.hours_sun }
  };
}

function saveCartLocal(){
  localStorage.setItem('ponto-da-carne-cart', JSON.stringify(cart));
}

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2400);
}
function fmtPrice(v){
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}

/* ============ HERO / INFO RENDER ============ */
function renderSettingsUI(){
  document.getElementById('metaAddress').textContent = settings.address;
  const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(settings.address);
  document.getElementById('infoAddress').textContent = settings.address;
  document.getElementById('infoAddress').href = mapsUrl;
  document.getElementById('infoWhats').textContent = formatWhatsDisplay(settings.whatsapp);
  document.getElementById('infoInsta').textContent = '@' + settings.instagram;
  document.getElementById('infoInsta').href = 'https://www.instagram.com/' + settings.instagram + '/';
  document.getElementById('footInsta').href = 'https://www.instagram.com/' + settings.instagram + '/';
  document.getElementById('hoursList').innerHTML =
    '<strong>Qua a Sex:</strong> ' + settings.hours.week + '<br>' +
    '<strong>Sábado:</strong> ' + settings.hours.sat + '<br>' +
    '<strong>Domingo:</strong> ' + settings.hours.sun + ' <span style="color:var(--flame);">— especial de assados 🍗</span>';
}
function formatWhatsDisplay(n){
  if(!n) return '—';
  const d = n.replace(/\D/g,'');
  if(d.length >= 12) return '+' + d.slice(0,2) + ' ' + d.slice(2,4) + ' ' + d.slice(4,9) + '-' + d.slice(9);
  return n;
}
function normalizeTime(tok){
  tok = tok.trim().toLowerCase();
  if(tok.includes('h')){
    let [h,m] = tok.split('h');
    h = h.trim(); m = (m||'').trim();
    if(m === '') m = '00';
    return h.padStart(2,'0') + ':' + m.padStart(2,'0');
  }
  return tok;
}
function parseRange(rangeStr){
  if(!rangeStr) return [];
  return rangeStr.split(',').map(s=>{
    const parts = s.trim().split(/\s*(?:às|as|-)\s*/i);
    if(parts.length < 2 || !parts[0] || !parts[1]) return null;
    return [normalizeTime(parts[0]), normalizeTime(parts[1])];
  }).filter(Boolean);
}
function timeToMin(t){
  const [h,m] = t.split(':').map(Number);
  return h*60+m;
}
let isStoreOpen = true;

function updateStatus(){
  const now = new Date();
  const day = now.getDay();
  const nowMin = now.getHours()*60 + now.getMinutes();
  let ranges = [];
  if(day === 0) ranges = parseRange(settings.hours.sun);
  else if(day === 6) ranges = parseRange(settings.hours.sat);
  else ranges = parseRange(settings.hours.week);

  let open = false;
  let todayLabel = ranges.map(r=>r.join(' às ')).join(' / ') || 'Fechado';
  for(const [o,c] of ranges){
    if(nowMin >= timeToMin(o) && nowMin <= timeToMin(c)){ open = true; break; }
  }
  isStoreOpen = open;
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  if(open){ dot.classList.remove('closed'); txt.textContent = 'Aberto agora'; }
  else{ dot.classList.add('closed'); txt.textContent = 'Fechado no momento'; }
  document.getElementById('metaHours').textContent = todayLabel;
  const notice = document.getElementById('closedNotice');
  if(notice) notice.style.display = open ? 'none' : 'block';
}

/* ============ CATALOG RENDER ============ */
function getCategories(){
  return ['Todos', ...new Set(products.filter(p=>p.active).map(p=>p.category))];
}
function renderTabs(){
  const wrap = document.getElementById('tabs');
  wrap.innerHTML = '';
  getCategories().forEach(cat=>{
    const btn = document.createElement('button');
    btn.className = 'tab' + (cat===currentCategory ? ' active' : '');
    btn.textContent = cat;
    btn.onclick = () => { currentCategory = cat; renderTabs(); renderGrid(); };
    wrap.appendChild(btn);
  });
}
function cartQtyFor(id){
  const line = cart.find(c=>c.id===id);
  return line ? line.qty : 0;
}
function renderGrid(){
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  const list = products.filter(p=>p.active && (currentCategory==='Todos' || p.category===currentCategory));
  if(list.length===0){
    grid.innerHTML = '<div class="empty-msg">Nenhum produto nessa categoria ainda.</div>';
    return;
  }
  list.forEach(p=>{
    const step = p.unit === 'kg' ? 0.5 : 1;
    const qty = cartQtyFor(p.id);
    const card = document.createElement('div');
    card.className = 'card' + (p.sold_out ? ' sold-out' : '');
    card.innerHTML = `
      <span class="cat-tag">${p.category}</span>
      ${p.sold_out ? '<span class="sold-out-badge">Sem estoque hoje</span>' : ''}
      <div class="icon">${p.icon || '🥩'}</div>
      <h3>${p.name}</h3>
      <p class="desc">${p.desc || ''}</p>
      <div class="price-row"><span class="price">${fmtPrice(p.price)}</span><span class="unit">/ ${p.unit}</span></div>
      <div class="card-footer">
        <div class="qty-stepper">
          <button ${p.sold_out?'disabled':''} onclick="stepQty('${p.id}', ${-step})">−</button>
          <span id="qty-${p.id}">${qty>0? qty : step}</span>
          <button ${p.sold_out?'disabled':''} onclick="stepQty('${p.id}', ${step})">+</button>
        </div>
        <button class="add-btn" ${p.sold_out?'disabled':''} onclick="addToCart('${p.id}')">${p.sold_out?'Esgotado':'Adicionar'}</button>
      </div>
    `;
    grid.appendChild(card);
  });
}
function stepQty(id, delta){
  const el = document.getElementById('qty-'+id);
  const prod = products.find(p=>p.id===id);
  const step = prod.unit === 'kg' ? 0.5 : 1;
  let val = displayQty[id] !== undefined ? displayQty[id] : (prod.unit==='kg'?0.5:1);
  val = Math.max(step, Math.round((val + delta)*10)/10);
  displayQty[id] = val;
  el.textContent = val;
}
function addToCart(id){
  const prod = products.find(p=>p.id===id);
  if(prod.sold_out){ toast('Esse item está sem estoque hoje'); return; }
  const step = prod.unit === 'kg' ? 0.5 : 1;
  const qty = displayQty[id] !== undefined ? displayQty[id] : step;
  const existing = cart.find(c=>c.id===id);
  if(existing){ existing.qty += qty; } else { cart.push({id, qty}); }
  saveCartLocal();
  renderCart();
  toast(prod.name + ' adicionado ao carrinho');
}

/* ============ CART ============ */
function toggleMobileNav(){
  document.getElementById('mobileNav').classList.toggle('show');
}
function closeMobileNav(){
  document.getElementById('mobileNav').classList.remove('show');
}

function openCart(){
  document.getElementById('drawer').classList.add('show');
  document.getElementById('overlay').classList.add('show');
}
function closeCart(){
  document.getElementById('drawer').classList.remove('show');
  document.getElementById('overlay').classList.remove('show');
}
function setFulfillment(mode){
  fulfillment = mode;
  document.getElementById('btnDelivery').classList.toggle('active', mode==='delivery');
  document.getElementById('btnPickup').classList.toggle('active', mode==='pickup');
  document.getElementById('deliveryFields').style.display = mode==='delivery' ? 'block' : 'none';
  renderCartTotals();
}
function changeLineQty(id, delta){
  const line = cart.find(c=>c.id===id);
  if(!line) return;
  line.qty = Math.round((line.qty + delta)*10)/10;
  if(line.qty <= 0){ cart = cart.filter(c=>c.id!==id); }
  saveCartLocal();
  renderCart();
}
function removeLine(id){
  cart = cart.filter(c=>c.id!==id);
  saveCartLocal();
  renderCart();
}
function cartSubtotal(){
  return cart.reduce((sum,line)=>{
    const p = products.find(pr=>pr.id===line.id);
    if(!p) return sum;
    return sum + p.price * line.qty;
  },0);
}
function renderCart(){
  document.getElementById('cartCount').textContent = cart.reduce((n,l)=>n+ (l.qty>0?1:0),0);
  const body = document.getElementById('cartBody');
  const foot = document.getElementById('cartFoot');
  body.innerHTML = '';
  if(cart.length===0){
    body.innerHTML = '<div class="cart-empty">🛒<br>Seu carrinho está vazio.<br>Escolha uns cortes no cardápio!</div>';
    foot.style.display = 'none';
    renderGrid();
    return;
  }
  foot.style.display = 'block';
  cart.forEach(line=>{
    const p = products.find(pr=>pr.id===line.id);
    if(!p) return;
    const row = document.createElement('div');
    row.className = 'cart-line';
    row.innerHTML = `
      <div class="icon">${p.icon||'🥩'}</div>
      <div class="info">
        <div class="n">${p.name}</div>
        <div class="p">${fmtPrice(p.price)} / ${p.unit}</div>
        <button class="remove" onclick="removeLine('${p.id}')">remover</button>
      </div>
      <div class="ctrl">
        <button onclick="changeLineQty('${p.id}', ${p.unit==='kg'?-0.5:-1})">−</button>
        <span>${line.qty}${p.unit==='kg'?'kg':''}</span>
        <button onclick="changeLineQty('${p.id}', ${p.unit==='kg'?0.5:1})">+</button>
      </div>
    `;
    body.appendChild(row);
  });
  setFulfillment(fulfillment);
  renderCartTotals();
  renderGrid();
}
function renderCartTotals(){
  const subtotal = cartSubtotal();
  let deliveryFee = 0;
  const row = document.getElementById('sumDeliveryRow');
  if(fulfillment==='delivery'){
    row.style.display = 'flex';
    deliveryFee = settings.deliveryFee;
    if(settings.freeThreshold > 0 && subtotal >= settings.freeThreshold) deliveryFee = 0;
  }else{
    row.style.display = 'none';
  }
  document.getElementById('sumSubtotal').textContent = fmtPrice(subtotal);
  document.getElementById('sumDelivery').textContent = deliveryFee===0 ? 'Grátis' : fmtPrice(deliveryFee);
  document.getElementById('sumTotal').textContent = fmtPrice(subtotal + deliveryFee);
}
function sendWhatsApp(){
  if(cart.length===0){ toast('Seu carrinho está vazio'); return; }
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const notes = document.getElementById('custNotes').value.trim();
  const address = document.getElementById('custAddress').value.trim();

  if(!name){ toast('Digite seu nome para finalizar'); return; }
  if(fulfillment==='delivery' && !address){ toast('Digite o endereço de entrega'); return; }

  const subtotal = cartSubtotal();
  let deliveryFee = 0;
  if(fulfillment==='delivery'){
    deliveryFee = settings.deliveryFee;
    if(settings.freeThreshold > 0 && subtotal >= settings.freeThreshold) deliveryFee = 0;
  }
  const total = subtotal + deliveryFee;

  let msg = `🥩 *Novo pedido - Ponto da Carne*\n\n`;
  msg += `*Cliente:* ${name}\n`;
  if(phone) msg += `*Telefone:* ${phone}\n`;
  msg += `\n*Itens:*\n`;
  cart.forEach(line=>{
    const p = products.find(pr=>pr.id===line.id);
    if(!p) return;
    const lineTotal = p.price * line.qty;
    msg += `• ${line.qty}${p.unit==='kg'?'kg':'x'} ${p.name} — ${fmtPrice(lineTotal)}\n`;
  });
  msg += `\n*Subtotal:* ${fmtPrice(subtotal)}\n`;
  if(fulfillment==='delivery'){
    msg += `*Entrega:* ${deliveryFee===0?'Grátis':fmtPrice(deliveryFee)}\n`;
    msg += `*Endereço:* ${address}\n`;
  }else{
    msg += `*Retirada na loja:* ${settings.address}\n`;
  }
  msg += `*Total: ${fmtPrice(total)}*\n`;
  if(notes) msg += `\n*Observações:* ${notes}\n`;
  msg += `\n_Pedido enviado pelo site Ponto da Carne_`;

  window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ============ ADMIN ============ */
function openAdmin(){
  document.getElementById('adminModal').classList.add('show');
  // if session cookie still valid, jump straight into the panel
  fetch('/api/admin/check').then(r=>{
    if(r.ok){
      document.getElementById('adminLogin').style.display = 'none';
      document.getElementById('adminPanel').style.display = 'block';
      loadSettingsIntoForm();
      renderProdList();
    }
  });
}
function closeAdmin(){
  document.getElementById('adminModal').classList.remove('show');
}
async function tryLogin(){
  const val = document.getElementById('adminPass').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try{
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ password: val })
    });
    const data = await res.json();
    if(res.ok){
      document.getElementById('adminLogin').style.display = 'none';
      document.getElementById('adminPanel').style.display = 'block';
      document.getElementById('adminPass').value = '';
      loadSettingsIntoForm();
      renderProdList();
    }else{
      errEl.textContent = data.error || 'Não foi possível entrar.';
    }
  }catch(e){
    errEl.textContent = 'Erro de conexão com o servidor.';
  }
}
async function logoutAdmin(){
  await fetch('/api/admin/logout', { method:'POST' });
  document.getElementById('adminPanel').style.display = 'none';
  document.getElementById('adminLogin').style.display = 'block';
}
function showAdminTab(tab){
  document.querySelectorAll('.admin-tabs button').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('admin-products').classList.toggle('active', tab==='products');
  document.getElementById('admin-settings').classList.toggle('active', tab==='settings');
}
function loadSettingsIntoForm(){
  document.getElementById('setWhats').value = settings.whatsapp;
  document.getElementById('setInsta').value = settings.instagram;
  document.getElementById('setAddress').value = settings.address;
  document.getElementById('setDeliveryFee').value = settings.deliveryFee;
  document.getElementById('setFreeThreshold').value = settings.freeThreshold;
  document.getElementById('hoursWeek').value = settings.hours.week;
  document.getElementById('hoursSat').value = settings.hours.sat;
  document.getElementById('hoursSun').value = settings.hours.sun;
  document.getElementById('setAdminPass').value = '';
}
async function saveSettings(){
  const body = {
    whatsapp: document.getElementById('setWhats').value,
    instagram: document.getElementById('setInsta').value,
    address: document.getElementById('setAddress').value.trim(),
    delivery_fee: parseFloat(document.getElementById('setDeliveryFee').value) || 0,
    free_threshold: parseFloat(document.getElementById('setFreeThreshold').value) || 0,
    hours_week: document.getElementById('hoursWeek').value.trim(),
    hours_sat: document.getElementById('hoursSat').value.trim(),
    hours_sun: document.getElementById('hoursSun').value.trim(),
    new_password: document.getElementById('setAdminPass').value.trim()
  };
  const res = await fetch('/api/admin/settings', {
    method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  const data = await res.json();
  if(res.ok){
    const s = await fetch('/api/settings').then(r=>r.json());
    settings = normalizeSettings(s);
    renderSettingsUI();
    updateStatus();
    toast('Configurações salvas');
  }else{
    toast(data.error || 'Erro ao salvar');
  }
}
function renderProdList(){
  const wrap = document.getElementById('prodList');
  wrap.innerHTML = '';
  products.forEach(p=>{
    const row = document.createElement('div');
    row.className = 'prod-row';
    row.innerHTML = `
      <div style="font-size:22px;">${p.icon||'🥩'}</div>
      <div><div class="n">${p.name}</div><div class="c">${p.category}</div></div>
      <div class="pr">${fmtPrice(p.price)}/${p.unit}</div>
      <button class="toggle ${p.active?'on':'off'}" onclick="toggleActive('${p.id}')">${p.active?'Ativo':'Oculto'}</button>
      <button class="toggle ${p.sold_out?'off':'on'}" onclick="toggleSoldOut('${p.id}')">${p.sold_out?'Esgotado':'Em estoque'}</button>
      <button class="edit" onclick="openProductForm('${p.id}')">Editar</button>
      <button class="del" onclick="deleteProduct('${p.id}')">Excluir</button>
    `;
    wrap.appendChild(row);
  });
}
async function refreshProducts(){
  products = await fetch('/api/products').then(r=>r.json());
}
async function toggleActive(id){
  const p = products.find(pr=>pr.id===id);
  await fetch('/api/admin/products/'+id, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ active: !p.active })
  });
  await refreshProducts();
  renderProdList(); renderTabs(); renderGrid();
}
async function toggleSoldOut(id){
  const p = products.find(pr=>pr.id===id);
  await fetch('/api/admin/products/'+id, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ sold_out: !p.sold_out })
  });
  await refreshProducts();
  renderProdList(); renderGrid();
}
async function deleteProduct(id){
  if(!confirm('Excluir este produto definitivamente?')) return;
  await fetch('/api/admin/products/'+id, { method:'DELETE' });
  await refreshProducts();
  renderProdList(); renderTabs(); renderGrid();
  toast('Produto excluído');
}
function openProductForm(id){
  editingProductId = id || null;
  const p = id ? products.find(pr=>pr.id===id) : {name:'',category:'',price:'',unit:'kg',desc:'',icon:'🥩'};
  const wrap = document.getElementById('prodFormWrap');
  wrap.innerHTML = `
    <div class="form-grid" style="background:var(--char);padding:18px;border-radius:10px;margin-bottom:18px;border:1px solid var(--line);">
      <div><label>Nome</label><input id="fName" value="${p.name}"></div>
      <div><label>Categoria</label><input id="fCategory" value="${p.category}" placeholder="Ex: Bovina, Aves, Kits"></div>
      <div><label>Preço (R$)</label><input id="fPrice" type="number" step="0.01" value="${p.price}"></div>
      <div><label>Unidade</label>
        <select id="fUnit">
          <option value="kg" ${p.unit==='kg'?'selected':''}>kg</option>
          <option value="un" ${p.unit==='un'?'selected':''}>unidade</option>
          <option value="pacote" ${p.unit==='pacote'?'selected':''}>pacote</option>
          <option value="kit" ${p.unit==='kit'?'selected':''}>kit</option>
        </select>
      </div>
      <div><label>Ícone (emoji)</label><input id="fIcon" value="${p.icon||'🥩'}"></div>
      <div class="full"><label>Descrição curta</label><input id="fDesc" value="${p.desc||''}"></div>
      <div class="full" style="display:flex;gap:10px;">
        <button class="save-settings-btn" onclick="saveProduct()">Salvar produto</button>
        <button class="save-settings-btn" style="background:transparent;border:1px solid var(--line);color:var(--bone-dim);" onclick="cancelProductForm()">Cancelar</button>
      </div>
    </div>
  `;
}
function cancelProductForm(){
  document.getElementById('prodFormWrap').innerHTML = '';
  editingProductId = null;
}
async function saveProduct(){
  const name = document.getElementById('fName').value.trim();
  const category = document.getElementById('fCategory').value.trim();
  const price = parseFloat(document.getElementById('fPrice').value);
  const unit = document.getElementById('fUnit').value;
  const icon = document.getElementById('fIcon').value.trim() || '🥩';
  const desc = document.getElementById('fDesc').value.trim();

  if(!name || !category || isNaN(price)){ toast('Preencha nome, categoria e preço'); return; }

  const body = { name, category, price, unit, icon, desc };
  let res;
  if(editingProductId){
    res = await fetch('/api/admin/products/'+editingProductId, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
  }else{
    res = await fetch('/api/admin/products', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
  }
  if(res.ok){
    await refreshProducts();
    cancelProductForm();
    renderProdList(); renderTabs(); renderGrid();
    toast('Produto salvo');
  }else{
    const data = await res.json();
    toast(data.error || 'Erro ao salvar produto');
  }
}

init();
