const $=(id)=>document.getElementById(id);
async function getCfg(){
  return await chrome.storage.local.get(['running','serverUrl','deviceUid','deviceKey','enrollToken','lastUploadAt','lastError']);
}
function okCfg(c){ return !!(c.serverUrl && c.deviceUid && (c.deviceKey || c.enrollToken)); }

async function refresh(){
  const c = await getCfg();
  const running = !!c.running;

  $('statePill').className='pill ' + (running?'on':'off');
  $('statePill').textContent=running?'ON':'OFF';

  $('stopBtn').disabled = !running;
  $('capBtn').disabled = !running;

  $('cfgWarn').style.display = okCfg(c) ? 'none' : 'block';
  $('duid').textContent = c.deviceUid || '—';

  $('statusText').textContent = c.lastError ? ('Error: ' + c.lastError) : (running ? 'Running' : (okCfg(c) ? 'Ready' : 'Not configured'));
  $('lastUpload').textContent = c.lastUploadAt || '—';
}

$('optBtn').addEventListener('click', async ()=>{ await chrome.runtime.openOptionsPage(); window.close(); });

$('startBtn').addEventListener('click', async ()=>{
  const c = await getCfg();
  if(!okCfg(c)){
    await chrome.runtime.openOptionsPage();
    return;
  }
  if(!$('agree').checked){
    alert('Please tick I agree.');
    return;
  }
  await chrome.storage.local.set({running:true, lastError:''});
  await chrome.runtime.sendMessage({type:'IMTS_START'});
  window.close();
});

$('stopBtn').addEventListener('click', async ()=>{
  await chrome.storage.local.set({running:false});
  await chrome.runtime.sendMessage({type:'IMTS_STOP'});
  window.close();
});

$('capBtn').addEventListener('click', async ()=>{
  await chrome.runtime.sendMessage({type:'IMTS_CAPTURE_NOW'});
  window.close();
});

refresh();
