/* FPL Squad Check — the footer

   Two things that belong at the bottom of every page and nowhere else: a way
   to support the site, and a way to reach the author.

   The contact form posts to Formspree over `fetch` rather than a plain form
   submission. A normal submit would navigate away to formspree.io, which means
   losing whatever was on screen and coming back through a foreign confirmation
   page. With fetch the answer arrives in place and the page never moves — the
   price is one entry in `connect-src` in _headers.

   The js/ files load as classic <script> tags in a fixed order and share one
   global scope; the order is written down in index.html.
   ============================================================ */

const FORMSPREE = 'https://formspree.io/f/xyegyyjo';
const COFFEE = 'https://buymeacoffee.com/pjx88';

function footerHtml(){
  return `
    <div class="foot-in">
      <div class="foot-brand">
        <b>FPL Squad Check</b>
        <span>An unofficial tool. Not affiliated with the Premier League
          or Fantasy Premier League.</span>
      </div>

      <div class="foot-acts">
        <a class="coffee" href="${COFFEE}" target="_blank" rel="noopener noreferrer">
          <span aria-hidden="true">☕</span> Support the site
        </a>
        <button type="button" class="lnkbtn" id="contactOpen"
          aria-expanded="false" aria-controls="contactBox">Contact the author</button>
      </div>

      <div id="contactBox" class="foot-form" hidden>
        <label>Your email
          <input type="email" id="cfEmail" autocomplete="email"
            placeholder="so I can reply">
        </label>
        <label>Message
          <textarea id="cfMsg" rows="4"
            placeholder="A bug, an idea, or a league that will not load…"></textarea>
        </label>
        <div class="foot-send">
          <button type="button" class="small" id="cfSend">Send</button>
          <span id="cfMsgOut" role="status" aria-live="polite"></span>
        </div>
      </div>
    </div>`;
}

function drawFooter(){
  let el = document.getElementById('sitefoot');
  if(!el){
    el = document.createElement('footer');
    el.id = 'sitefoot';
    document.body.appendChild(el);
  }
  el.innerHTML = footerHtml();
}

/* Delegated, because the footer is written once but the app around it is
   redrawn constantly — and because the form only exists after it is opened. */
document.addEventListener('click', async ev => {
  const open = ev.target.closest('#contactOpen');
  if(open){
    const box = document.getElementById('contactBox');
    if(!box) return;
    box.hidden = !box.hidden;
    open.setAttribute('aria-expanded', String(!box.hidden));
    if(!box.hidden){
      const first = document.getElementById('cfEmail');
      if(first) first.focus();
    }
    return;
  }

  const send = ev.target.closest('#cfSend');
  if(!send) return;

  const email = (document.getElementById('cfEmail') || {}).value || '';
  const message = (document.getElementById('cfMsg') || {}).value || '';
  const out = document.getElementById('cfMsgOut');
  const say = txt => { if(out) out.textContent = txt; };

  /* Validated here, not by the browser: there is no <form>, so `required`
     would do nothing. A rejection from Formspree arrives after a round trip
     and reads like a fault of the app. */
  if(!message.trim()) return say('Write a message first.');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
    return say('That email address does not look right.');

  send.disabled = true;
  say('Sending…');
  try{
    const r = await fetch(FORMSPREE, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify({email: email.trim(), message: message.trim()}),
    });
    if(!r.ok) throw new Error(String(r.status));
    say('Thank you — it arrived.');
    const m = document.getElementById('cfMsg');
    if(m) m.value = '';
  }catch(e){
    say('It did not go through. Try again, or write to me on GitHub.');
  }finally{
    send.disabled = false;
  }
});

drawFooter();
