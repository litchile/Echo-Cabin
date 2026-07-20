(function(){const r=document.createElement("link").relList;if(r&&r.supports&&r.supports("modulepreload"))return;for(const c of document.querySelectorAll('link[rel="modulepreload"]'))$(c);new MutationObserver(c=>{for(const i of c)if(i.type==="childList")for(const x of i.addedNodes)x.tagName==="LINK"&&x.rel==="modulepreload"&&$(x)}).observe(document,{childList:!0,subtree:!0});function o(c){const i={};return c.integrity&&(i.integrity=c.integrity),c.referrerPolicy&&(i.referrerPolicy=c.referrerPolicy),c.crossOrigin==="use-credentials"?i.credentials="include":c.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function $(c){if(c.ep)return;c.ep=!0;const i=o(c);fetch(c.href,i)}})();const C=document.querySelector("#app");if(!C)throw new Error("Missing #app");let s="scene-empty",f="scene-empty",l="recording",u=!1,p=!1,_=0,q=0,k=null,j=null,y=!1,b="char-1",v="小岚",I="",a=[{id:"char-1",name:"小岚"},{id:"char-2",name:"小岚 2"}];const h="/assets/echo-character-front.png",F="/assets/echo-cabin-room.jpg",K=()=>[{id:"char-1",name:"小岚"},{id:"char-2",name:"小岚 2"}],w=()=>a.find(t=>t.id===b)??a[0]??{id:"draft",name:v||"新角色"},z=()=>{p=!1,j!==null&&window.clearInterval(j),j=null,k!==null&&window.clearTimeout(k),k=null,q+=1},e=t=>{z(),f=s,s=t,y=!1,(s==="recording-create"||s==="recording-edit")&&(_=0,j=window.setInterval(()=>{_+=1;const r=document.querySelector("[data-recording-time]");r&&(r.textContent=`00:${String(_).padStart(2,"0")}`)},1e3)),g()},B=()=>!s.includes("edit")&&!s.includes("scene"),U=()=>s==="identity"?"创建角色":s.includes("edit")||s==="edit-current"||s==="discard-edit"?"编辑角色声音":"为角色添加声音",G=()=>{if(!B())return"";const t=s==="identity";return`
    <nav class="stepper" aria-label="创建进度">
      <span class="stepper__step" data-current="${t}">
        <strong>${t?"1":"已完成"}</strong><span>身份</span>
      </span>
      <span class="stepper__line" aria-hidden="true"></span>
      <span class="stepper__step" data-current="${!t}">
        <strong>2</strong><span>声音</span>
      </span>
    </nav>`},S=(t="你的角色")=>{const r=B()?v||"新角色":w().name;return`
  <aside class="character-summary">
    <p class="eyebrow">${t}</p>
    <img class="character-summary__image" src="${h}" alt="${w().name} 的全身形象" />
    <strong>${r}</strong>
    <span class="soft-status">${s.includes("edit")||s==="edit-current"?"当前声音保持生效":"身份已准备好"}</span>
  </aside>`},D=(t,r="00:04")=>`
  <div class="sound-player" data-playing="${p}">
    <button class="play-button" type="button" data-action="toggle-play" aria-label="${p?"暂停试听":"播放试听"}">
      <i class="ph ${p?"ph-pause":"ph-play"}" aria-hidden="true"></i><span>${p?"暂停":"播放"}</span>
    </button>
    <div class="sound-player__track">
      <div class="sound-player__labels"><strong>${t}</strong><span>${r}</span></div>
      <progress max="100" value="${p?48:0}"></progress>
    </div>
  </div>`,d=(t,r="")=>`
  <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="screen-title">
    ${G()}
    <div class="modal-card__heading">
      <p class="brand-kicker">ECHO CABIN</p>
      <h1 id="screen-title">${U()}</h1>
    </div>
    <div class="modal-card__content">${t}</div>
    ${r?`<footer class="modal-card__footer">${r}</footer>`:""}
  </section>`,J=()=>d(`
  <div class="identity-layout">
    <div class="identity-form">
      <label class="field-label" for="character-name">你的名字</label>
      <input id="character-name" class="text-input" value="${v}" maxlength="12" autocomplete="off" />
      <p class="field-error" aria-live="polite">${I}</p>
      <p class="eyebrow">选择形象</p>
      <button class="avatar-choice" type="button" aria-pressed="true">
        <img src="${h}" alt="蓝发角色全身形象" />
        <span><strong>小屋旅伴</strong><small>已选择</small></span>
      </button>
      <p class="quiet-note">更多形象会在后续开放</p>
    </div>
    <div class="identity-preview">
      <img src="${h}" alt="当前选择的角色形象预览" />
      <span>全身形象预览</span>
    </div>
  </div>`,`
    <button class="button button--quiet" type="button" data-action="cancel-create">取消创建</button>
    <button class="button button--primary" type="button" data-action="identity-next">下一步</button>`),Q=()=>d(`
  <div class="split-layout">
    ${S()}
    <div class="flow-content">
      <p class="eyebrow">添加一段代表你的声音</p>
      <h2>你想怎样留下声音？</h2>
      <p class="supporting-copy">两种方式都可以随时重新选择。当前预览只模拟交互，不会启用麦克风或读取文件。</p>
      <div class="source-grid">
        <button class="source-card" type="button" data-action="record-create">
          <i class="ph ph-microphone" aria-hidden="true"></i><strong>现场录音</strong><span>在小屋里录下一句声音</span>
        </button>
        <button class="source-card" type="button" data-action="import-create">
          <i class="ph ph-folder-open" aria-hidden="true"></i><strong>本地导入</strong><span>选择设备里已有的音频</span>
        </button>
      </div>
    </div>
  </div>`,`
    <button class="button button--quiet" type="button" data-action="back-identity">返回身份</button>
    <button class="button button--quiet" type="button" data-action="cancel-create">取消创建</button>`),E=t=>d(`
  <div class="focus-panel">
    <p class="eyebrow">现场录音</p>
    <h2>录下一句代表你的声音</h2>
    <p>建议录制 2–5 秒，在安静的地方效果更好。只有点击“开始录音”后，浏览器才会请求麦克风权限。</p>
    <div class="notice-box"><strong>这是模拟预览</strong><span>不会请求真实麦克风权限，也不会保存任何声音。</span></div>
    <div class="button-row button-row--center">
      <button class="button button--primary" type="button" data-action="start-record-${t}">开始录音</button>
      ${t==="create"?'<button class="button button--secondary" type="button" data-action="back-source">返回声音来源</button>':'<button class="button button--secondary" type="button" data-action="back-edit-current">返回当前声音</button>'}
    </div>
  </div>`),P=t=>d(`
  <div class="focus-panel focus-panel--error">
    <p class="eyebrow">麦克风权限</p>
    <h2>无法使用麦克风</h2>
    <p>请检查浏览器的麦克风权限，然后重新尝试。你的角色资料和现有声音没有改变。</p>
    <div class="button-row button-row--center">
      <button class="button button--primary" type="button" data-action="retry-mic-${t}">再试一次</button>
      <button class="button button--secondary" type="button" data-action="${t==="create"?"back-source":"back-edit-current"}">${t==="create"?"返回声音来源":"返回当前声音"}</button>
    </div>
  </div>`),L=t=>d(`
  <div class="recording-panel" aria-live="polite">
    <p class="eyebrow">正在录音</p>
    <i class="ph ph-microphone recording-icon" aria-hidden="true"></i>
    <strong class="recording-time" data-recording-time>00:${String(_).padStart(2,"0")}</strong>
    <p>说完后点击停止。你可以先试听确认，也可以直接保存这段声音。</p>
    <div class="button-row button-row--center">
      <button class="button button--primary" type="button" data-action="stop-record-${t}">停止录音</button>
      <button class="button button--secondary" type="button" data-action="cancel-record-${t}">取消录音</button>
    </div>
  </div>`),O=t=>{const r=l==="recording";return d(`
    <div class="split-layout split-layout--sound">
      ${S(t==="create"?"你的角色":"正在编辑")}
      <div class="flow-content">
        <p class="eyebrow">${t==="create"?"声音已准备好":"试听新声音"}</p>
        <h2>${r?"刚刚录下的声音":"刚刚导入的声音"}</h2>
        ${D("候选声音")}
        <p class="listening-hint">${u?"已试听。确认合适后可以保存。":"试听是可选的；你也可以直接保存。"}</p>
        <div class="button-row">
          <button class="button button--secondary" type="button" data-action="${r?`record-${t}`:`import-${t}`}">${r?"重新录音":"重新选择文件"}</button>
          <button class="button button--text" type="button" data-action="change-source-${t}">更换声音来源</button>
        </div>
      </div>
    </div>`,`
      <button class="button button--quiet" type="button" data-action="${t==="create"?"back-identity":"exit-edit"}">${t==="create"?"返回身份":"返回场景"}</button>
      <button class="button button--primary" type="button" data-action="save-${t}">${t==="create"?"保存声音并创建角色":"替换声音"}</button>`)},N=t=>d(`
  <div class="focus-panel">
    <p class="eyebrow">本地导入</p>
    <h2>从设备选择声音文件</h2>
    <p>正式阶段会由浏览器打开系统文件选择器，并在本机读取与检查音频；不需要后端。这个 UI Shell 不会读取你的真实文件。</p>
    <div class="mock-file-picker" aria-label="模拟文件选择器">
      <i class="ph ph-file-audio" aria-hidden="true"></i>
      <span><strong>尚未选择文件</strong><small>支持格式与大小会在阶段 4 集中校验</small></span>
    </div>
    <div class="button-row button-row--center">
      <button class="button button--primary" type="button" data-action="choose-import-${t}">模拟选择 echo-demo.m4a</button>
      <button class="button button--secondary" type="button" data-action="cancel-import-${t}">模拟关闭文件选择器</button>
    </div>
  </div>`,`
    <button class="button button--quiet" type="button" data-action="${t==="create"?"back-source":"back-edit-current"}">${t==="create"?"返回声音来源":"返回当前声音"}</button>`),T=t=>d(`
  <div class="focus-panel">
    <p class="eyebrow">本地导入</p>
    <h2>正在读取声音文件</h2>
    <p>请稍等片刻。处理完成前不会重复打开文件选择，也不会改变已有声音。</p>
    <progress class="loading-progress" max="100" value="62"></progress>
    <button class="button button--quiet" type="button" disabled>处理中</button>
  </div>`),A=t=>d(`
  <div class="focus-panel focus-panel--error">
    <p class="eyebrow">本地导入</p>
    <h2>无法读取这个声音文件</h2>
    <p>请重新选择一个常见格式的音频文件。${t==="edit"?"角色原来的声音仍在使用。":"你的角色资料仍然保留。"}</p>
    <div class="button-row button-row--center">
      <button class="button button--primary" type="button" data-action="import-${t}">重新选择文件</button>
      <button class="button button--secondary" type="button" data-action="${t==="create"?"back-source":"back-edit-current"}">${t==="create"?"返回声音来源":"返回当前声音"}</button>
    </div>
  </div>`),M=t=>d(`
  <div class="focus-panel">
    <p class="eyebrow">${t==="create"?"正在创建角色":"正在替换声音"}</p>
    <h2>正在把声音安放好</h2>
    <p>这个过程只用于预览保存状态。处理中已暂时关闭返回与重复提交。</p>
    <progress class="loading-progress" max="100" value="76"></progress>
  </div>`),H=t=>d(`
  <div class="split-layout split-layout--sound">
    ${S(t==="create"?"角色草稿":"正在编辑")}
    <div class="flow-content flow-content--error">
      <p class="eyebrow">保存没有完成</p>
      <h2>暂时无法保存${t==="edit"?"新声音":""}</h2>
      <p>${t==="edit"?"原来的声音仍在使用，新声音也已保留。":"角色还没有创建，候选声音仍然保留。"}</p>
      <div class="button-row">
        <button class="button button--primary" type="button" data-action="retry-save-${t}">重新尝试保存</button>
        <button class="button button--secondary" type="button" data-action="return-candidate-${t}">返回试听</button>
        ${t==="create"?'<button class="button button--text" type="button" data-action="cancel-create">取消创建</button>':""}
      </div>
    </div>
  </div>`),R=t=>d(`
  <div class="focus-panel">
    <p class="eyebrow">${t==="create"?"取消创建":"退出声音编辑"}</p>
    <h2>${t==="create"?"放弃创建这个角色吗？":"放弃这段尚未保存的新声音吗？"}</h2>
    <p>${t==="create"?"已填写的信息和未保存的声音将不会保留。":"当前角色原来的声音不会受到影响。"}</p>
    <div class="button-row button-row--center">
      <button class="button button--primary" type="button" data-action="continue-${t}">继续${t==="create"?"创建":"编辑"}</button>
      <button class="button button--secondary" type="button" data-action="discard-${t}">确认放弃</button>
    </div>
  </div>`),V=()=>d(`
  <div class="split-layout split-layout--sound">
    ${S("当前角色")}
    <div class="flow-content">
      <p class="eyebrow">当前正式声音</p>
      <h2>${w().name} 的声音</h2>
      ${D("当前声音")}
      <p class="supporting-copy">新声音保存成功前，这段声音会继续使用。</p>
      <div class="source-grid source-grid--compact">
        <button class="source-card" type="button" data-action="record-edit"><i class="ph ph-microphone" aria-hidden="true"></i><strong>重新录音</strong><span>录制一段候选新声音</span></button>
        <button class="source-card" type="button" data-action="import-edit"><i class="ph ph-folder-open" aria-hidden="true"></i><strong>重新导入</strong><span>从设备选择候选声音</span></button>
      </div>
    </div>
  </div>`,'<button class="button button--quiet" type="button" data-action="back-scene">返回场景</button>'),W=()=>y?`
    <section class="role-popover" aria-label="角色切换">
      <p><strong>${a.length} / 4 个角色</strong><span>选择头像即可切换</span></p>
      <div class="role-list">
        ${a.map(t=>`
          <button class="role-option" type="button" data-action="switch-role" data-character-id="${t.id}" data-current="${t.id===b}">
            <img src="${h}" alt="${t.name}" /><span>${t.name}</span>
          </button>`).join("")}
      </div>
      <div class="role-popover__actions">
        <button class="button button--secondary" type="button" data-action="edit-current">编辑角色声音</button>
        <button class="button button--primary" type="button" data-action="add-character" ${a.length>=4?"disabled":""}>${a.length>=4?"已达到角色上限":"添加角色"}</button>
      </div>
    </section>`:"",n=t=>`
  <div class="scene-stage" aria-label="Echo Cabin 房间场景">
    <img class="scene-stage__background" src="${F}" alt="温暖的小屋房间" />
    ${t?"":a.map((r,o)=>`
      <div class="scene-character scene-character--${o+1}" data-current="${r.id===b}">
        <img src="${h}" alt="${r.name}" /><span>${r.name}</span>
      </div>`).join("")}
    <header class="scene-brand"><strong>Echo Cabin</strong><span>把朋友的声音放进小屋</span></header>
    ${t?`
      <section class="empty-entry">
        <p>小屋正在等第一位旅伴</p>
        <button class="button button--primary" type="button" data-action="create-first">创建第一个角色</button>
      </section>`:`
      <button class="current-role-button" type="button" data-action="toggle-role-popover" aria-expanded="${y}">
        <img src="${h}" alt="当前角色：${w().name}" />
        <span>${w().name}</span>
      </button>
      ${W()}`}
  </div>`,X=()=>`
  <details class="debug-nav">
    <summary>预览状态</summary>
    <div class="debug-nav__grid">
      <button data-jump="scene-empty">空场景</button><button data-jump="scene">角色场景</button>
      <button data-jump="identity">身份</button><button data-jump="source">声音来源</button>
      <button data-jump="mic-denied-create">权限拒绝</button><button data-jump="recording-create">录音中</button>
      <button data-jump="candidate-create">创建试听</button><button data-jump="import-error-create">导入失败</button>
      <button data-jump="save-error-create">创建保存失败</button><button data-jump="edit-current">当前声音</button>
      <button data-jump="candidate-edit">替换试听</button><button data-jump="save-error-edit">替换失败</button>
    </div>
  </details>`,Y=()=>{switch(s){case"scene-empty":return n(!0);case"scene":return n(!1);case"identity":return n(a.length===0)+`<div class="scrim">${J()}</div>`;case"source":return n(a.length===0)+`<div class="scrim">${Q()}</div>`;case"record-intro-create":return n(a.length===0)+`<div class="scrim">${E("create")}</div>`;case"record-intro-edit":return n(!1)+`<div class="scrim">${E("edit")}</div>`;case"mic-denied-create":return n(a.length===0)+`<div class="scrim">${P("create")}</div>`;case"mic-denied-edit":return n(!1)+`<div class="scrim">${P("edit")}</div>`;case"recording-create":return n(a.length===0)+`<div class="scrim">${L("create")}</div>`;case"recording-edit":return n(!1)+`<div class="scrim">${L("edit")}</div>`;case"import-picker-create":return n(a.length===0)+`<div class="scrim">${N("create")}</div>`;case"import-picker-edit":return n(!1)+`<div class="scrim">${N("edit")}</div>`;case"importing-create":return n(a.length===0)+`<div class="scrim">${T()}</div>`;case"importing-edit":return n(!1)+`<div class="scrim">${T()}</div>`;case"candidate-create":return n(a.length===0)+`<div class="scrim">${O("create")}</div>`;case"candidate-edit":return n(!1)+`<div class="scrim">${O("edit")}</div>`;case"import-error-create":return n(a.length===0)+`<div class="scrim">${A("create")}</div>`;case"import-error-edit":return n(!1)+`<div class="scrim">${A("edit")}</div>`;case"saving-create":return n(a.length===0)+`<div class="scrim">${M("create")}</div>`;case"saving-edit":return n(!1)+`<div class="scrim">${M("edit")}</div>`;case"save-error-create":return n(a.length===0)+`<div class="scrim">${H("create")}</div>`;case"save-error-edit":return n(!1)+`<div class="scrim">${H("edit")}</div>`;case"cancel-create":return n(a.length===0)+`<div class="scrim">${R("create")}</div>`;case"discard-edit":return n(!1)+`<div class="scrim">${R("edit")}</div>`;case"edit-current":return n(!1)+`<div class="scrim">${V()}</div>`}},g=()=>{C.innerHTML=`<main class="prototype-shell">${Y()}${X()}</main>`;const t=document.querySelector("#character-name");t?.addEventListener("input",()=>{v=t.value,I=""})},m=(t,r)=>{e(t);const o=q;k=window.setTimeout(()=>{o===q&&(k=null,r())},900)};C.addEventListener("click",t=>{const r=t.target.closest("[data-action], [data-jump]");if(!r)return;const o=r.dataset.jump;if(o){(o.includes("edit")||o==="scene")&&a.length===0&&(a=K(),b=a[0].id),l=o.includes("import")?"import":"recording",u=o.includes("candidate")||o.includes("save-error"),e(o);return}const $=r.dataset.action;switch($){case"create-first":a=[],b="",e("identity");break;case"add-character":e("identity");break;case"identity-next":{const c=v.trim();c?(v=c,e("source")):(I="请输入角色名字",g(),document.querySelector("#character-name")?.focus());break}case"cancel-create":f=s,e("cancel-create");break;case"continue-create":e(f==="cancel-create"?"identity":f);break;case"discard-create":v="",u=!1,e(a.length?"scene":"scene-empty");break;case"back-identity":e("identity");break;case"back-source":e("source");break;case"record-create":case"change-source-create":l="recording",u=!1,e($==="change-source-create"?"source":"record-intro-create");break;case"record-edit":l="recording",u=!1,e("record-intro-edit");break;case"change-source-edit":l=l==="recording"?"import":"recording",u=!1,e(l==="recording"?"record-intro-edit":"import-picker-edit");break;case"start-record-create":e("recording-create");break;case"start-record-edit":e("recording-edit");break;case"retry-mic-create":e("record-intro-create");break;case"retry-mic-edit":e("record-intro-edit");break;case"stop-record-create":l="recording",u=!1,e("candidate-create");break;case"stop-record-edit":l="recording",u=!1,e("candidate-edit");break;case"cancel-record-create":e("source");break;case"cancel-record-edit":e("edit-current");break;case"import-create":l="import",u=!1,e("import-picker-create");break;case"import-edit":l="import",u=!1,e("import-picker-edit");break;case"choose-import-create":m("importing-create",()=>e("candidate-create"));break;case"choose-import-edit":m("importing-edit",()=>e("candidate-edit"));break;case"cancel-import-create":e("source");break;case"cancel-import-edit":e("edit-current");break;case"toggle-play":p=!p,u=!0,g();break;case"save-create":m("saving-create",()=>{const c=v||`角色 ${a.length+1}`,i={id:`char-${a.length+1}`,name:c};a=[...a,i].slice(0,4),b=a.at(-1)?.id??b,e("scene")});break;case"save-edit":m("saving-edit",()=>e("edit-current"));break;case"retry-save-create":m("saving-create",()=>e("scene"));break;case"retry-save-edit":m("saving-edit",()=>e("edit-current"));break;case"return-candidate-create":e("candidate-create");break;case"return-candidate-edit":e("candidate-edit");break;case"back-edit-current":e("edit-current");break;case"back-scene":e("scene");break;case"exit-edit":f="candidate-edit",e("discard-edit");break;case"continue-edit":e("candidate-edit");break;case"discard-edit":u=!1,e("scene");break;case"toggle-role-popover":y=!y,g();break;case"switch-role":{const c=r.dataset.characterId;c&&(b=c),y=!1,z(),g();break}case"edit-current":e("edit-current");break}});g();
