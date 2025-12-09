// ======================
// Minimal Feed Config
// ======================
const FEED_DB_URL = "https://parthsocialhack-default-rtdb.firebaseio.com/";
const feedDB = new FirebaseAPI(FEED_DB_URL);

let postsCache = {};
let postEls = {};
let usersCache = {};
let fetching = false;
let lastFetch = 0;

const me = () => localStorage.getItem("username");
const escapeHTML = s => (s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const avatarSrc = v => (!v?null:(v.startsWith("data:")?v:`data:image/*;base64,${v}`));

// ======================
// Auth
// ======================
function checkAuth(){
  if(!localStorage.getItem("authToken")) location.href="index.html";
}

// ======================
// Modal
// ======================
const modal = {
  box: q("#postModal"),
  text: q("#modalText"),
  author: q("#modalAuthor"),
  close: q("#modalClose"),
  save: q("#modalSave"),
  del: q("#modalDelete"),
  id: null
};

modal.close.onclick = () => hideModal();
modal.save.onclick = async () => {
  if(!modal.id) return;
  const t = modal.text.value.trim();
  await feedDB.set(`posts/${modal.id}/content`,t);
  postsCache[modal.id].content=t;
  updatePost(modal.id);
  hideModal();
};
modal.del.onclick = async () => {
  if(!modal.id) return;
  await deletePost(modal.id);
  hideModal();
};

function showModal(id,txt,author,avatar){
  modal.id=id;
  modal.text.value=txt||"";
  modal.author.innerHTML = `${avatar?`<img src="${avatar}" class="avatar-sm">`:`<div class="avatar-sm placeholder"></div>`}
                           <span>${escapeHTML(author)}</span>`;
  modal.box.classList.remove("hidden");
}
function hideModal(){
  modal.id=null;
  modal.box.classList.add("hidden");
}

function q(s){return document.querySelector(s);}

// ======================
// Render Post
// ======================
const feed = q("#feedPosts");

function makePost(p,u){
  const el=document.createElement("div");
  el.className="post";
  el.dataset.id=p.id;

  const a = avatarSrc(u?.avatar);
  const time = p.createdAt?new Date(p.createdAt).toLocaleString():"";

  el.innerHTML = `
    <div class="post-header">
      <div class="author-block">
        ${a?`<img src="${a}" class="avatar-sm">`:`<div class="avatar-sm placeholder"></div>`}
        <a href="profile.html?user=${encodeURIComponent(p.author)}">${escapeHTML(p.author)}</a>
      </div>
      <div class="post-right">
        <div class="post-time">${escapeHTML(time)}</div>
        <button class="menu-btn">⋯</button>
      </div>
    </div>
    <div class="post-content"></div>
    <div class="post-actions">
      <button class="post-action-btn like-btn">👍 <span></span></button>
      <button class="post-action-btn love-btn">❤️ <span></span></button>
      <button class="post-action-btn comments-toggle">💬 <span></span></button>
    </div>
    <div class="comments-section" style="display:none"></div>
  `;

  const refs = {
    box:el,
    content:el.querySelector(".post-content"),
    like:el.querySelector(".like-btn"),
    love:el.querySelector(".love-btn"),
    commentsBtn:el.querySelector(".comments-toggle"),
    comments:el.querySelector(".comments-section"),
    menu:el.querySelector(".menu-btn")
  };
  postEls[p.id]=refs;

  refs.like.onclick=()=>toggleReact(p.id,"likes");
  refs.love.onclick=()=>toggleReact(p.id,"loves");
  refs.commentsBtn.onclick=()=>toggleComments(p.id);
  refs.menu.onclick=()=>showMenu(refs.menu,p,u);

  updatePost(p.id);
  return el;
}

function updatePost(id){
  const p=postsCache[id], r=postEls[id];
  if(!r || !p) return;

  r.content.textContent=p.content||"";

  const likes = p.likes?Object.keys(p.likes).length:0;
  const loves = p.loves?Object.keys(p.loves).length:0;
  const coms  = p.comments?Object.keys(p.comments).length:0;

  r.like.classList.toggle("active", !!p.likes?.[me()]);
  r.love.classList.toggle("active", !!p.loves?.[me()]);
  r.like.querySelector("span").textContent=likes;
  r.love.querySelector("span").textContent=loves;
  r.commentsBtn.querySelector("span").textContent=coms;
}

// ======================
// Menu
// ======================
function showMenu(btn,p,u){
  document.querySelectorAll(".post-menu").forEach(m=>m.remove());
  const m=document.createElement("div");
  m.className="post-menu";
  m.innerHTML=`<button class="edit">Edit</button><button class="delete">Delete</button>`;
  document.body.appendChild(m);

  const rect=btn.getBoundingClientRect();
  m.style.left=(rect.right-160)+"px";
  m.style.top=(rect.bottom+6)+"px";

  if(p.author!==me()) m.querySelectorAll("button").forEach(b=>b.style.display="none");
  else{
    m.querySelector(".edit").onclick=()=>{
      showModal(p.id,p.content,p.author,avatarSrc(u?.avatar));
      m.remove();
    };
    m.querySelector(".delete").onclick=()=>{ deletePost(p.id); m.remove(); };
  }

  setTimeout(()=>document.addEventListener("click",e=>{if(!m.contains(e.target)&&e.target!==btn)m.remove();},{once:true}));
}

// ======================
// Feed Loading
// ======================
async function loadFeed(){
  if(fetching) return;
  fetching=true;

  try{
    const [rawP,rawU] = await Promise.all([
      feedDB.get("posts")||{},
      feedDB.get("users")||{}
    ]);

    usersCache=rawU;

    const arr = Object.entries(rawP)
      .map(([id,p])=>({...p,id}))
      .filter(p=>!p.deleted)
      .sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));

    const seen=new Set();
    for(const p of arr){
      seen.add(p.id);

      if(!postsCache[p.id]){
        postsCache[p.id]=p;
        const el=makePost(p,usersCache[p.author]);
        feed.insertBefore(el,feed.firstChild);
      } else {
        const old=postsCache[p.id];

        // cheap change test
        if(old.content!==p.content ||
           old.likes!==p.likes ||
           old.loves!==p.loves ||
           old.comments!==p.comments){
          postsCache[p.id]=p;
          updatePost(p.id);
        }
      }
    }

    // cleanup removed posts
    for(const id in postsCache){
      if(!seen.has(id)){
        postEls[id]?.box.remove();
        delete postEls[id];
        delete postsCache[id];
      }
    }
  }finally{
    fetching=false;
    lastFetch=Date.now();
  }
}

// ======================
// Reactions
// ======================
async function toggleReact(id,key){
  const user=me();
  if(!user) return;

  const p=postsCache[id]||{};
  const map={...(p[key]||{})};

  map[user]?delete map[user]:map[user]=true;

  p[key]=map;
  postsCache[id]=p;
  updatePost(id);

  try{
    await feedDB.set(`posts/${id}/${key}`,map);
  }catch{
    const fresh=await feedDB.get(`posts/${id}`);
    if(fresh){
      postsCache[id]=fresh;
      updatePost(id);
    }
  }
}

// ======================
// Comments
// ======================
async function toggleComments(id){
  const r=postEls[id];
  if(!r) return;

  if(r.comments.style.display==="none"){
    r.comments.style.display="block";
    renderComments(id);
  } else r.comments.style.display="none";
}

async function renderComments(id){
  const r=postEls[id];
  if(!r) return;

  r.comments.innerHTML="Loading...";
  const p=await feedDB.get(`posts/${id}`)||{};
  const c=p.comments||{};
  postsCache[id]=p;

  r.comments.innerHTML="";
  const arr=Object.values(c).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));

  for(const x of arr){
    const el=document.createElement("div");
    el.className="comment";
    el.innerHTML = `<b>${escapeHTML(x.author)}:</b> ${escapeHTML(x.text)}
                    <div class="comment-time">${new Date(x.createdAt).toLocaleString()}</div>`;
    if(x.author===me()){
      const e=document.createElement("button");
      e.textContent="Edit";
      e.onclick=()=>editComment(id,x.id,x.text);
      const d=document.createElement("button");
      d.textContent="Delete";
      d.onclick=()=>deleteComment(id,x.id);
      el.append(e,d);
    }
    r.comments.appendChild(el);
  }

  addCommentInput(id,r.comments);
}

function addCommentInput(id,parent){
  const w=document.createElement("div");
  w.className="comment-input";
  w.innerHTML=`<input><button>Post</button>`;
  const inp=w.querySelector("input");
  w.querySelector("button").onclick=async()=>{
    const t=inp.value.trim();
    if(!t) return;
    await addComment(id,t);
    renderComments(id);
  };
  parent.appendChild(w);
}

async function addComment(id,text){
  const user=me();
  const cId=feedDB.generateId();
  const payload={id:cId,author:user,text,createdAt:new Date().toISOString()};
  await feedDB.set(`posts/${id}/comments/${cId}`,payload);
}

async function editComment(id,cId,old){
  const t=prompt("Edit:",old);
  if(t===null) return;
  await feedDB.set(`posts/${id}/comments/${cId}/text`,t);
  renderComments(id);
}

async function deleteComment(id,cId){
  if(!confirm("Delete?")) return;
  await feedDB.delete(`posts/${id}/comments/${cId}`);
  renderComments(id);
}

// ======================
// Create Post
// ======================
(function(){
  const btn=q("#postBtn"), txt=q("#postText");
  if(!btn||!txt) return;
  btn.onclick=async()=>{
    const t=txt.value.trim(), u=me();
    if(!t) return;
    btn.disabled=true;
    const id=feedDB.generateId();
    const post={id,author:u,content:t,likes:{},loves:{},comments:{},createdAt:new Date().toISOString()};
    await feedDB.set(`posts/${id}`,post);
    postsCache[id]=post;

    feed.insertBefore(makePost(post,usersCache[u]),feed.firstChild);
    txt.value=""; btn.disabled=false;
  };
})();

// ======================
// Init
// ======================
document.addEventListener("DOMContentLoaded",()=>{
  checkAuth();
  loadFeed();
  setInterval(()=>{ if(!fetching && Date.now()-lastFetch>3000) loadFeed(); },5000);
});
