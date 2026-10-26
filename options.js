const DEFAULT_SERVER = "https://20.mituniversity.in/api/chrome_upload.php";
const DEFAULT_ENROLL = "IMTS-ENROLL-CHANGE-ME-VERY-LONG-SECRET";

const $=(id)=>document.getElementById(id);

async function ensureUid(){
  const c=await chrome.storage.local.get(['deviceUid']);
  if(c.deviceUid) return c.deviceUid;

  const p = await chrome.runtime.getPlatformInfo();
  const rand = Math.random().toString(16).slice(2,8).toUpperCase();
  const uid = `CHROME-${p.os.toUpperCase()}-${p.arch.toUpperCase()}-${rand}`;
  await chrome.storage.local.set({deviceUid: uid});
  return uid;
}

async function load(){
  const uid = await ensureUid();
  const c=await chrome.storage.local.get(['serverUrl','deviceKey','systemName','enrollToken']);
  $('serverUrl').value = c.serverUrl || DEFAULT_SERVER;
  $('deviceUid').value = uid;
  $('deviceKey').value = c.deviceKey || '';
  $('systemName').value = c.systemName || '';
  $('enrollToken').value = c.enrollToken || DEFAULT_ENROLL;

  // Auto-save defaults once (so popup works without user typing)
  if(!c.serverUrl || !c.enrollToken) {
    await chrome.storage.local.set({serverUrl:$('serverUrl').value.trim(), enrollToken:$('enrollToken').value.trim()});
  }
}

async function save(){
  const serverUrl=$('serverUrl').value.trim();
  const deviceKey=$('deviceKey').value.trim();
  const systemName=$('systemName').value.trim();
  const enrollToken=$('enrollToken').value.trim();
  await ensureUid();

  if(!serverUrl){
    $('msg').textContent='Please fill Server URL.';
    return false;
  }
  await chrome.storage.local.set({serverUrl,deviceKey,systemName,enrollToken,lastError:''});
  $('msg').textContent='Saved.';
  return true;
}

async function testUpload(){
  const ok = await save();
  if(!ok) return;
  $('msg').textContent='Testing upload...';
  const resp = await chrome.runtime.sendMessage({type:'IMTS_CAPTURE_NOW', force:true});
  if(resp && resp.ok){
    $('msg').textContent = resp.auto_registered
      ? ('Auto-registered. Device Key saved. Upload OK. Refresh Admin dashboard.')
      : ('Upload OK. Refresh Admin dashboard.');
  } else {
    $('msg').textContent = 'Test failed: ' + ((resp && resp.error) ? resp.error : 'unknown error');
  }
}

$('saveBtn').addEventListener('click', save);
$('testBtn').addEventListener('click', testUpload);
load();
