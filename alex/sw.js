var CACHE_NAME = 'alex-v11';
var ASSETS = [
  '/manifest.json',
  '/supabase.js'
];

// Install
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean ALL old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — NETWORK FIRST for HTML, cache first for assets
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var url = e.request.url;
  if (url.includes('supabase.co') || url.includes('metered.live') || url.includes('googleapis.com')) return;

  // HTML pages — always try network first (get latest version)
  if (e.request.mode === 'navigate' || url.endsWith('.html') || url.endsWith('/')) {
    e.respondWith(
      fetch(e.request).then(function(resp) {
        if (resp.ok) {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        }
        return resp;
      }).catch(function() {
        return caches.match(e.request).then(function(c) { return c || caches.match('/index.html'); });
      })
    );
    return;
  }

  // Other assets — cache first
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(resp) {
        if (resp.ok && resp.type === 'basic') {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        }
        return resp;
      });
    })
  );
});

// === PUSH NOTIFICATION ===
self.addEventListener('push', function(e) {
  var data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch(err) {
    try { data = { title: e.data.text() }; } catch(x) {}
  }
  var title = data.title || 'Alex';
  var body = data.body || 'Новое сообщение';
  var chatId = data.chat || '';

  e.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'alex-msg-' + chatId,
      renotify: true,
      vibrate: [300, 100, 300],
      data: { chat: chatId }
    })
  );
});

// Click on notification — open chat
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var chat = (e.notification.data && e.notification.data.chat) || '';
  var isCall = (e.notification.data && e.notification.data.isCall) || false;

  e.waitUntil(
    // Закрываем все уведомления о звонке
    self.registration.getNotifications().then(function(notifs) {
      notifs.forEach(function(n) {
        if (n.tag && n.tag.indexOf('alex-call-') >= 0) n.close();
      });
    }).then(function() {
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    }).then(function(clients) {
      for (var i = 0; i < clients.length; i++) {
        var c = clients[i];
        if (c.url.includes('messenger-alex') || c.url.includes('localhost')) {
          c.focus();
          if (isCall) {
            c.postMessage({ type: 'CHECK_CALL' });
          } else if (chat) {
            c.postMessage({ type: 'OPEN_CHAT', chat: chat });
          }
          return;
        }
      }
      return self.clients.openWindow('/?chat=' + encodeURIComponent(chat));
    })
  );
});

// === BACKGROUND MESSAGE CHECK ===
var SUPABASE_URL = 'https://twxjeoxxineqdilutxcf.supabase.co';
var SUPABASE_KEY = 'sb_publishable_8Qv7wAepftPsW3kFIIsovQ_NztdEwL8';
var lastCheckTime = null;
var checkInterval = null;

// Start checking when a client tells us to
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'START_BG_CHECK') {
    var username = e.data.username;
    if (username) startBackgroundCheck(username);
  }
  if (e.data && e.data.type === 'STOP_BG_CHECK') {
    stopBackgroundCheck();
  }
  if (e.data && e.data.type === 'APP_VISIBLE') {
    // App is in foreground — stop background notifications
    lastCheckTime = new Date().toISOString();
  }
});

function startBackgroundCheck(username) {
  stopBackgroundCheck();
  lastCheckTime = new Date().toISOString();

  checkInterval = setInterval(function() {
    checkNewMessages(username);
  }, 10000); // Check every 10 seconds
}

function stopBackgroundCheck() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

async function checkNewMessages(username) {
  try {
    // Only notify if no visible client
    var clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    var hasVisible = false;
    for (var i = 0; i < clients.length; i++) {
      if (clients[i].visibilityState === 'visible') {
        hasVisible = true;
        break;
      }
    }
    if (hasVisible) {
      lastCheckTime = new Date().toISOString();
      return; // App is visible — don't show notifications
    }

    if (!lastCheckTime) return;

    // Fetch new messages since last check
    var url = SUPABASE_URL + '/rest/v1/messages?select=id,sender,text,chat,file_type,created_at&created_at=gt.' + encodeURIComponent(lastCheckTime) + '&sender=neq.' + encodeURIComponent(username) + '&order=created_at.desc&limit=5';

    var resp = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY
      }
    });

    if (!resp.ok) return;
    var messages = await resp.json();
    if (!messages || !messages.length) return;

    // Filter: only messages where I'm a participant
    var myMessages = messages.filter(function(m) {
      if (m.chat.startsWith('group:')) return true; // Groups — show all for now
      return m.chat.split('__').indexOf(username) >= 0;
    });

    if (!myMessages.length) return;

    // Show notification for each new message
    for (var j = 0; j < myMessages.length; j++) {
      var msg = myMessages[j];
      var senderName = msg.sender;
      var body = msg.text || (msg.file_type === 'image' ? 'Фото' : 'Файл');
      var isCallMsg = body.indexOf('Звонок') >= 0 || body.indexOf('Видеозвонок') >= 0;

      if (isCallMsg) {
        // Повторяем уведомление 6 раз каждые 4 сек (имитация звонка 24 сек)
        var callSender = senderName;
        var callChat = msg.chat;
        var callBody = body;
        for (var r = 0; r < 6; r++) {
          (function(idx) {
            setTimeout(function() {
              self.registration.showNotification('📞 ' + callSender + ' звонит!', {
                body: callBody,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: 'alex-call-' + callChat + '-' + idx,
                renotify: true,
                requireInteraction: true,
                vibrate: [800, 200, 800, 200, 800],
                actions: [{ action: 'answer', title: '📞 Открыть' }],
                data: { chat: callChat, isCall: true }
              });
            }, idx * 4000);
          })(r);
        }
      } else {
        await self.registration.showNotification(senderName, {
          body: body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'alex-msg-' + msg.chat,
          renotify: true,
          vibrate: [300, 100, 300],
          data: { chat: msg.chat, isCall: false }
        });
      }
    }

    lastCheckTime = new Date().toISOString();

    // Check for missed calls
    try {
      var sigUrl = SUPABASE_URL + '/rest/v1/signaling?select=id,from_user,type,payload,created_at&to_user=eq.' + encodeURIComponent(username) + '&type=eq.offer&order=created_at.desc&limit=3';
      var sigResp = await fetch(sigUrl, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY
        }
      });
      if (sigResp.ok) {
        var signals = await sigResp.json();
        if (signals && signals.length) {
          for (var k = 0; k < signals.length; k++) {
            var sig = signals[k];
            var callType = (sig.payload && sig.payload.video) ? 'Видеозвонок' : 'Звонок';
            await self.registration.showNotification('Входящий ' + callType.toLowerCase(), {
              body: 'от ' + sig.from_user,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: 'alex-call-' + sig.from_user,
              renotify: true,
              vibrate: [500, 200, 500, 200, 500],
              data: { chat: '' }
            });
          }
        }
      }
    } catch(ce) {}

  } catch(e) {
    // Silently fail — will retry next interval
  }
}
