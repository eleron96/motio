(function () {
  var doc = document;
  var root = doc.documentElement;

  function setPageHidden(hidden) {
    if (!root) return;
    if (hidden) {
      root.classList.add('timeline-kc-hidden');
    } else {
      root.classList.remove('timeline-kc-hidden');
    }
  }

  function findRestartControl() {
    var byId = doc.getElementById('reset-login');
    if (byId) return byId;

    var links = Array.prototype.slice.call(doc.querySelectorAll('a,button'));
    return (
      links.find(function (link) {
        var id = (link.id || '').toLowerCase();
        var href = (link.getAttribute('href') || '').toLowerCase();
        var text = (link.textContent || '').trim().toLowerCase();
        return (
          id.indexOf('restart') !== -1 ||
          href.indexOf('restart') !== -1 ||
          text.indexOf('restart login') !== -1
        );
      }) || null
    );
  }

  function ensureBranding() {
    var card = doc.querySelector('.login-pf-page .card-pf');
    if (!card) return;

    if (!card.querySelector('.timeline-brand')) {
      var brand = doc.createElement('div');
      brand.className = 'timeline-brand';
      brand.innerHTML = ''
        + '<span class="timeline-brand-mark" aria-hidden="true"></span>'
        + '<div class="timeline-brand-copy">'
        + '  <div class="timeline-brand-title">Motio</div>'
        + '  <div class="timeline-brand-subtitle">Timeline Planner</div>'
        + '</div>';

      var header = card.querySelector('.login-pf-header');
      if (header && header.parentNode === card) {
        card.insertBefore(brand, header);
      } else {
        card.insertBefore(brand, card.firstChild);
      }
    }

    if (!card.querySelector('.timeline-auth-footer')) {
      var footer = doc.createElement('div');
      footer.className = 'timeline-auth-footer';
      footer.textContent = '© Motio — Timeline Planner, NIKO G.';
      card.appendChild(footer);
    }
  }

  function isReAuthScreen() {
    var passwordInput = doc.getElementById('password');
    var usernameInput = doc.getElementById('username');
    var emailInput = doc.getElementById('email');
    var passwordConfirmInput = doc.getElementById('password-confirm');

    if (!passwordInput || usernameInput || emailInput || passwordConfirmInput) {
      return false;
    }

    var pageTitle = ((doc.getElementById('kc-page-title') || {}).textContent || '').toLowerCase();
    var hasReAuthTitle = pageTitle.indexOf('reauth') !== -1 || pageTitle.indexOf('повторно') !== -1;
    return hasReAuthTitle || Boolean(findRestartControl());
  }

  function run() {
    ensureBranding();

    if (!isReAuthScreen()) {
      setPageHidden(false);
      return;
    }

    setPageHidden(true);
    var revealTimer = window.setTimeout(function () {
      setPageHidden(false);
    }, 900);

    var restartControl = findRestartControl();

    if (!restartControl) {
      window.clearTimeout(revealTimer);
      setPageHidden(false);
      return;
    }

    try {
      var guardKey = 'timeline.kc.restart.' + window.location.search;
      if (window.sessionStorage.getItem(guardKey) === '1') {
        window.clearTimeout(revealTimer);
        setPageHidden(false);
        return;
      }
      window.sessionStorage.setItem(guardKey, '1');
    } catch (_error) {
      // Ignore sessionStorage errors.
    }

    var href = restartControl.getAttribute('href');
    if (href) {
      window.location.replace(href);
      return;
    }

    restartControl.click();
  }

  run();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  }
})();
