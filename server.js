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
async function ml(nc,kw){
  const h=E.ML_ACCESS_TOKEN?{Authorization:"Bearer "+E.ML_ACCESS_TOKEN}:{};
  const r=await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(kw)}&limit=10`,{headers:h});
  const j=await r.json();if(!j.results)throw new Error("Mercado Livre: "+JSON.stringify(j).slice(0,150));
  return j.results.sort((a,b)=>(b.sold_quantity||0)-(a.sold_quantity||0)).slice(0,5).map(n=>({id:"ml"+n.id,n:n.title,pr:n.price,old:n.original_price||0,cm:+E.ML_COMMISSION||8,cd:n.shipping?.free_shipping?"Frete grátis":"Mercado Livre",
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
    try{let n=0;for(const[nc,kw]of Object.entries(N)){const r=await fn(nc,kw);r.forEach(x=>{x.nc=nc;x.pl=pl;x.e=EMO[nc]});items.push(...r);n+=r.length}status[pl]=`ao vivo (${n} produtos)`}
    catch(e){status[pl]="erro: "+e.message.slice(0,160);if(!live)items.push(...demo(pl,N))}
  }
  items.sort((a,b)=>score(b)-score(a));cache[modo]={t:Date.now(),items,status};console.log(new Date().toLocaleTimeString(),modo,status);
}
const ensure=m=>{const c=cache[m];return !c||Date.now()-c.t>TTL?(busy[m]=busy[m]||refresh(m).finally(()=>busy[m]=null)):busy[m]};

http.createServer(async(q,s)=>{
  const u=new URL(q.url,"http://x");
  if(u.pathname==="/api/products"||u.pathname==="/api/status"){
    const m=u.searchParams.get("modo")==="esportes"?"esportes":"geral";await ensure(m);const cc=cache[m]||{status:{},t:0,items:[]};s.writeHead(200,{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"});
    const b={status:cc.status,at:cc.t};if(u.pathname==="/api/products")b.items=cc.items;return s.end(JSON.stringify(b))}
  const nm=u.pathname==="/"?"index.html":u.pathname.slice(1);
  if(!["index.html","esportes.html"].includes(nm)){s.writeHead(404);return s.end("404")}
  fs.readFile(path.join(__dirname,nm),(e,d)=>{if(e){s.writeHead(404);return s.end("404")}s.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});s.end(d)});
}).listen(PORT,()=>console.log("Radar de Ofertas em http://localhost:"+PORT));
