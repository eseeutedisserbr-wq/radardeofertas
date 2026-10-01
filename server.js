// Radar de Ofertas — backend sem dependências (Node 18+). Rode: node server.js
const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto");
try{fs.readFileSync(path.join(__dirname,".env"),"utf8").split("\n").forEach(l=>{const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"")})}catch{}
const E=process.env,PORT=E.PORT||3000,TTL=(+E.CACHE_MIN||15)*60000;
const SETS={
 geral:{"Culinária":"air fryer","Esportes":"halteres","Audiovisual":"ring light","Casa & Decoração":"luminária led","Eletrônicos":"suporte celular","Moda":"mochila","Beleza":"skincare","Saúde":"massageador"},
 esportes:{"Futebol":"chuteira","Musculação":"halteres","Corrida":"tênis de corrida","Ciclismo":"capacete ciclismo","Fitness & Yoga":"tapete de yoga","Suplementos":"whey protein","Roupas esportivas":"camiseta dry fit","Acessórios":"garrafa térmica"}};
const EMO={"Culinária":"🍳","Esportes":"⚽","Audiovisual":"🎬","Casa & Decoração":"🏠","Eletrônicos":"📱","Moda":"👗","Beleza":"💄","Saúde":"💊","Futebol":"⚽","Musculação":"🏋️","Corrida":"🏃","Ciclismo":"🚴","Fitness & Yoga":"🧘","Suplementos":"💪","Roupas esportivas":"👕","Acessórios":"🎧"};

// ---------- SHOPEE (API oficial de afiliados, GraphQL + assinatura SHA256) ----------
async function shopee(nc,kw){
  const q=`{productOfferV2(keyword:${JSON.stringify(kw)},sortType:2,page:1,limit:5){nodes{itemId productName imageUrl price priceMin priceDiscountRate commissionRate offerLink productLink sales}}}`;
  const body=JSON.stringify({query:q}),ts=Math.floor(Date.now()/1000);
  const sig=crypto.createHash("sha256").update(E.SHOPEE_APP_ID+ts+body+E.SHOPEE_SECRET).digest("hex");
  const r=await fetch("https://open-api.affiliate.shopee.com.br/graphql",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`SHA256 Credential=${E.SHOPEE_APP_ID}, Timestamp=${ts}, Signature=${sig}`},body});
  const j=await r.json();if(j.errors)throw new Error(JSON.stringify(j.errors));
  return j.data.productOfferV2.nodes.map(n=>{
    const pr=+n.price||+n.priceMin,rate=+n.commissionRate,d=+n.priceDiscountRate||0;
    return{id:"sp"+n.itemId,n:n.productName,pr,old:d>0?+(pr/(1-d/100)).toFixed(2):0,cm:+(rate<=1?rate*100:rate).toFixed(1),cd:"Oferta Shopee",lk:n.offerLink||n.productLink,img:n.imageUrl,sales:+n.sales||0}});
}

// ---------- AMAZON (Creators API, OAuth 2.0) ----------
let tok={t:"",exp:0};
async function amzToken(){
  if(Date.now()<tok.exp)return tok.t;
  const r=await fetch(E.AMAZON_TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({grant_type:"client_credentials",client_id:E.AMAZON_CREDENTIAL_ID,client_secret:E.AMAZON_CREDENTIAL_SECRET,scope:"creatorsapi::default"})});
  const j=await r.json();if(!j.access_token)throw new Error("token Amazon: "+JSON.stringify(j).slice(0,150));
  tok={t:j.access_token,exp:Date.now()+(j.expires_in||3600)*1000-60000};return tok.t;
}
async function amazon(nc,kw){
  const mk=E.AMAZON_MARKETPLACE||"www.amazon.com.br";
  const r=await fetch("https://creatorsapi.amazon/catalog/v1/searchItems",{method:"POST",headers:{Authorization:"Bearer "+await amzToken(),"Content-Type":"application/json","x-marketplace":mk},
    body:JSON.stringify({keywords:kw,partnerTag:E.AMAZON_PARTNER_TAG,marketplace:mk,itemCount:5,resources:["images.primary.large","itemInfo.title","offersV2.listings.price"]})});
  const j=await r.json(),items=j.searchResult?.items;if(!items)throw new Error("Amazon: "+JSON.stringify(j).slice(0,150));
  return items.map(i=>({id:"az"+i.asin,n:i.itemInfo?.title?.displayValue||"Produto Amazon",pr:+i.offersV2?.listings?.[0]?.price?.money?.amount||0,old:0,cm:+E.AMAZON_COMMISSION||8,cd:"Amazon",lk:i.detailPageURL,img:i.images?.primary?.large?.url||"",sales:0})).filter(x=>x.pr>0);
}

// ---------- MERCADO LIVRE (busca pública + seus parâmetros de afiliado) ----------
let mlTok={t:"",exp:0};
async function mlToken(){
  if(E.ML_ACCESS_TOKEN)return E.ML_ACCESS_TOKEN;
  if(!E.ML_CLIENT_ID||!E.ML_CLIENT_SECRET)return "";
  if(Date.now()<mlTok.exp)return mlTok.t;
  const r=await fetch("https://api.mercadolibre.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:new URLSearchParams({grant_type:"client_credentials",client_id:E.ML_CLIENT_ID,client_secret:E.ML_CLIENT_SECRET})});
  const j=await r.json();if(!j.access_token)throw new Error("token Mercado Livre: "+JSON.stringify(j).slice(0,150));
  mlTok={t:j.access_token,exp:Date.now()+(j.expires_in||21600)*1000-60000};return mlTok.t;
}
let COM={};try{COM=JSON.parse(E.ML_COMISSOES||"{}")}catch(e){}
// Tabela do Programa de Afiliados do Mercado Livre (venda direta, afiliados generalistas).
// Para sobrescrever algum nicho, use no Render a variável ML_COMISSOES, ex.: {"Beleza":18}
const MLPCT={"Culinária":5,"Esportes":16,"Audiovisual":5,"Casa & Decoração":12,"Eletrônicos":5,"Moda":16,"Beleza":16,"Saúde":12,
  "Futebol":16,"Musculação":16,"Corrida":16,"Ciclismo":16,"Fitness & Yoga":16,"Suplementos":16,"Roupas esportivas":16,"Acessórios":16};
const cmOf=nc=>+COM[nc]||MLPCT[nc]||+E.ML_COMMISSION||12;
const MLCAT={"Culinária":"Eletrodomésticos","Esportes":"Esportes e Fitness","Audiovisual":"Eletrônicos, Áudio e Vídeo","Casa & Decoração":"Casa, Móveis e Decoração","Eletrônicos":"Celulares e Telefones","Moda":"Calçados, Roupas e Bolsas","Beleza":"Beleza e Cuidado Pessoal","Saúde":"Saúde"};
const SPORTSUB={"Futebol":["futebol"],"Musculação":["musculacao","fitness"],"Corrida":["corrida","running"],"Ciclismo":["ciclismo"],"Fitness & Yoga":["yoga","pilates","fitness"],"Suplementos":["suplement"],"Roupas esportivas":["roupa","vestuario"],"Acessórios":["acessor"]};
const norm=s=>String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
let mlCats=null;
async function mlGet(url){const tk=await mlToken(),r=await fetch(url,{headers:tk?{Authorization:"Bearer "+tk}:{}}),j=await r.json();if(!r.ok)throw new Error("("+r.status+") "+JSON.stringify(j).slice(0,100));return j}
async function mlCatId(nc){
  mlCats=mlCats||await mlGet("https://api.mercadolibre.com/sites/MLB/categories");
  const find=(l,ws)=>l.find(c=>ws.some(w=>norm(c.name).includes(norm(w))));
  if(SPORTSUB[nc]){const p=find(mlCats,["Esportes e Fitness"]);if(!p)return null;const d=await mlGet("https://api.mercadolibre.com/categories/"+p.id);const c=find(d.children_categories||[],SPORTSUB[nc]);return c&&c.id}
  const w=MLCAT[nc],c=w&&find(mlCats,[w]);return c&&c.id}
async function mlGetAny(url){
  try{return await mlGet(url)}catch(e1){
    const r=await fetch(url),j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(e1.message+" | sem token ("+r.status+")");
    return j}}
async function pool(a,n,fn){for(let i=0;i<a.length;i+=n)await Promise.all(a.slice(i,i+n).map(fn))}
async function mlHighlights(nc){
  const id=await mlCatId(nc);if(!id)return [];
  const lim=+E.ML_POR_NICHO||30,H="https://api.mercadolibre.com/highlights/MLB/category/";
  let list=((await mlGet(H+id)).content||[]).slice();
  if(list.length<lim+10){try{
    const d=await mlGet("https://api.mercadolibre.com/categories/"+id);
    for(const k of (d.children_categories||[]).slice(0,+E.ML_SUBCATS||8)){
      if(list.length>=lim+10)break;
      try{const hk=(await mlGet(H+k.id)).content||[];hk.forEach(x=>{if(!list.some(y=>y.id===x.id))list.push(x)})}catch(e){}}
  }catch(e){}}
  const cand=list.slice(0,lim+10).map((x,i)=>({...x,idx:i})),out=[];
  const aff=u=>u+(u.includes("?")?"&":"?")+E.ML_AFFILIATE_PARAMS,cm=+E.ML_COMMISSION||8;
  const img=u=>String(u||"").replace("http:","https:");
  await pool(cand,5,async x=>{try{
    if(x.type==="ITEM"){const n=await mlGetAny("https://api.mercadolibre.com/items/"+x.id);if(n.price>0)out.push({idx:x.idx,id:"ml"+n.id,n:n.title,pr:n.price,old:n.original_price||0,cm,cd:n.shipping&&n.shipping.free_shipping?"Frete grátis":"Mercado Livre",lk:aff(n.permalink),img:img(n.thumbnail)});return}
    const p=x.id,pj=await mlGetAny("https://api.mercadolibre.com/products/"+p),b=pj.buy_box_winner||{};let pr=+b.price,old=+b.original_price||0,free=b.shipping&&b.shipping.free_shipping;
    if(!(pr>0)){const ij=await mlGetAny("https://api.mercadolibre.com/products/"+p+"/items?limit=1"),arr=ij.results||ij.items||(Array.isArray(ij)?ij:[]),it=arr[0]||{};pr=+it.price;old=+it.original_price||0;free=it.shipping&&it.shipping.free_shipping}
    if(pr>0)out.push({idx:x.idx,id:"mlp"+p,n:pj.name,pr,old,cm,cd:free?"Frete grátis":"Mercado Livre",lk:aff("https://www.mercadolivre.com.br/p/"+p),img:img(pj.pictures&&pj.pictures[0]&&pj.pictures[0].url)})}catch(e){}});
  out.sort((a,b)=>a.idx-b.idx);
  return out.slice(0,lim).map((x,i)=>{const {idx,...r}=x;return {...r,rank:i+1,sales:Math.max(1,lim+10-idx)*100}})}
async function mlDebug(nc){
  const d={niche:nc,tem_id_e_secret:!!(E.ML_CLIENT_ID&&E.ML_CLIENT_SECRET),tem_parametros_afiliado:!!E.ML_AFFILIATE_PARAMS};
  const step=async(k,fn)=>{try{d[k]=await fn()}catch(e){d[k]="ERRO "+String(e.message).slice(0,200)}};
  const probe=async(url,tok)=>{const t=tok?await mlToken():"",r=await fetch(url,{headers:t?{Authorization:"Bearer "+t}:{}}),j=await r.json().catch(()=>({}));return{status:r.status,campos:Object.keys(j).slice(0,12),erro:r.ok?undefined:JSON.stringify(j).slice(0,100),j}};
  await step("token_ok",async()=>!!(await mlToken()));
  await step("busca",async()=>{const x=await probe("https://api.mercadolibre.com/sites/MLB/search?q=halteres&limit=3",true);return{status:x.status,resultados:(x.j.results||[]).length}});
  let id=null,hc=[];
  await step("categoria",async()=>{id=await mlCatId(nc);return id||"não encontrada"});
  if(id)await step("destaques",async()=>{const h=await mlGet("https://api.mercadolibre.com/highlights/MLB/category/"+id);hc=h.content||[];return{total:hc.length,itens:hc.filter(x=>x.type==="ITEM").length,produtos:hc.filter(x=>x.type==="PRODUCT").length}});
  const p=hc.find(x=>x.type==="PRODUCT"),it=hc.find(x=>x.type==="ITEM");
  const show=x=>({status:x.status,campos:x.campos,erro:x.erro});
  if(p){
    await step("produto_com_token",async()=>{const x=await probe("https://api.mercadolibre.com/products/"+p.id,true);return{...show(x),preco_vencedor:x.j.buy_box_winner&&x.j.buy_box_winner.price,tem_nome:!!x.j.name}});
    await step("produto_sem_token",async()=>show(await probe("https://api.mercadolibre.com/products/"+p.id,false)));
    await step("itens_do_produto",async()=>{const x=await probe("https://api.mercadolibre.com/products/"+p.id+"/items?limit=1",true);return show(x)})}
  if(it){
    await step("item_com_token",async()=>show(await probe("https://api.mercadolibre.com/items/"+it.id,true)));
    await step("item_sem_token",async()=>show(await probe("https://api.mercadolibre.com/items/"+it.id,false)))}
  if(id)await step("lista_final",async()=>(await mlHighlights(nc)).length);
  return d}
async function ml(nc,kw){
  const tk=await mlToken(),h=tk?{Authorization:"Bearer "+tk}:{};
  const r=await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(kw)}&limit=10`,{headers:h});
  const j=await r.json();if(!j.results){
    try{const hl=await mlHighlights(nc);if(hl.length)return hl}catch(e){throw new Error("busca ("+r.status+")"+(tk?"":" sem token")+" | mais vendidos: "+e.message.slice(0,110))}
    return []}
  return j.results.sort((a,b)=>(b.sold_quantity||0)-(a.sold_quantity||0)).slice(0,5).map(n=>({id:"ml"+n.id,n:n.title,pr:n.price,old:n.original_price||0,cm:cmOf(nc),cd:n.shipping?.free_shipping?"Frete grátis":"Mercado Livre",
    lk:n.permalink+(n.permalink.includes("?")?"&":"?")+E.ML_AFFILIATE_PARAMS,img:(n.thumbnail||"").replace("http:","https:"),sales:n.sold_quantity||0}));
}

// ---------- DEMONSTRAÇÃO (sem credenciais) ----------
function demo(pl,N){const out=[];Object.keys(N).forEach((nc,i)=>{for(let k=0;k<2;k++){
  const s=(i*7+k*3+pl.length)%9,pr=+(29.9+s*23.5+k*40).toFixed(2);
  out.push({id:`demo-${pl}-${i}-${k}`,n:`${N[nc][0].toUpperCase()+N[nc].slice(1)} modelo ${k+1} (demo)`,pr,old:k?+(pr*1.3).toFixed(2):0,cm:6+((s+k)%9),cd:"Frete grátis (demo)",lk:`https://exemplo.com/${i}${k}`,img:"",sales:(s+1)*(k+2)*120,demo:1,nc,pl,e:EMO[nc]})}});return out}

// ---------- ATUALIZAÇÃO E CACHE ----------
const CONN={
  "Shopee":[shopee,()=>E.SHOPEE_APP_ID&&E.SHOPEE_SECRET],
  "Amazon":[amazon,()=>E.AMAZON_CREDENTIAL_ID&&E.AMAZON_CREDENTIAL_SECRET&&E.AMAZON_TOKEN_URL&&E.AMAZON_PARTNER_TAG],
  "Mercado Livre":[ml,()=>E.ML_AFFILIATE_PARAMS]};
const cache={},busy={};
const score=p=>(p.pr*p.cm/100)*Math.log(2+(p.sales||0));
async function refresh(modo){
  const N=SETS[modo],items=[],status={},live=Object.values(CONN).some(([,ok])=>ok());
  for(const[pl,[fn,ok]]of Object.entries(CONN)){
    if(!ok()){status[pl]=live?"não configurada":"demonstração (sem credenciais)";if(!live)items.push(...demo(pl,N));continue}
    try{let n=0;for(const[nc,kw]of Object.entries(N)){const r=await fn(nc,kw);r.forEach(x=>{x.nc=nc;x.pl=pl;x.e=EMO[nc]});items.push(...r);n+=r.length}status[pl]=n?`ao vivo (${n} produtos)`:"conectada, mas sem produtos retornados"}
    catch(e){status[pl]="erro: "+e.message.slice(0,160);if(!live)items.push(...demo(pl,N))}
  }
  items.sort((a,b)=>score(b)-score(a));cache[modo]={t:Date.now(),items,status};console.log(new Date().toLocaleTimeString(),modo,status);
}
const ensure=m=>{const c=cache[m];return !c||Date.now()-c.t>TTL?(busy[m]=busy[m]||refresh(m).catch(()=>{}).finally(()=>busy[m]=null)):busy[m]};

http.createServer(async(q,s)=>{
  const u=new URL(q.url,"http://x");
  if(u.pathname==="/api/debug-ml"){const d=await mlDebug(u.searchParams.get("nc")||"Esportes");s.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});return s.end(JSON.stringify(d,null,1))}
  if(u.pathname==="/api/products"||u.pathname==="/api/status"){
    const m=u.searchParams.get("modo")==="esportes"?"esportes":"geral";const pr=ensure(m);if(!cache[m])await pr;const cc=cache[m]||{status:{},t:0,items:[]};s.writeHead(200,{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"});
    const b={status:cc.status,at:cc.t};if(u.pathname==="/api/products")b.items=cc.items;return s.end(JSON.stringify(b))}
  const nm=u.pathname==="/"?"index.html":u.pathname.slice(1);
  if(!["index.html","esportes.html"].includes(nm)){s.writeHead(404);return s.end("404")}
  fs.readFile(path.join(__dirname,nm),(e,d)=>{if(e){s.writeHead(404);return s.end("404")}s.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});s.end(d)});
}).listen(PORT,()=>{console.log("Radar de Ofertas em http://localhost:"+PORT);ensure("geral");ensure("esportes")});
