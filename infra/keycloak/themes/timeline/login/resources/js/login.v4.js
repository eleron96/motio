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

  function disableAutofocus() {
    var autoFocusNodes = doc.querySelectorAll('[autofocus]');
    autoFocusNodes.forEach(function (node) {
      node.removeAttribute('autofocus');
    });

    window.setTimeout(function () {
      var active = doc.activeElement;
      if (!active) return;
      var activeId = (active.id || '').toLowerCase();
      if (activeId === 'username' || activeId === 'email') {
        active.blur();
      }
    }, 0);
  }

  function fixPasswordToggleControls() {
    var controls = Array.prototype.slice.call(doc.querySelectorAll('[data-password-toggle]'));
    controls.forEach(function (button) {
      var targetId = button.getAttribute('aria-controls');
      if (!targetId) return;
      var input = doc.getElementById(targetId);
      if (!input) return;

      button.setAttribute('tabindex', '-1');
      button.tabIndex = -1;

      // Visible password => open eye, hidden password => crossed eye.
      button.dataset.iconShow = 'fa fa-eye-slash';
      button.dataset.iconHide = 'fa fa-eye';

      function syncIcon() {
        var icon = button.querySelector('i');
        if (!icon) return;
        if (input.type === 'password') {
          icon.className = button.dataset.iconShow || 'fa fa-eye-slash';
          button.setAttribute('aria-label', button.dataset.labelShow || 'Show password');
        } else {
          icon.className = button.dataset.iconHide || 'fa fa-eye';
          button.setAttribute('aria-label', button.dataset.labelHide || 'Hide password');
        }
      }

      syncIcon();
      button.addEventListener('click', function () {
        window.setTimeout(syncIcon, 0);
      });
    });
  }

  function moveRegisterRequiredHint() {
    var registerForm = doc.getElementById('kc-register-form');
    if (!registerForm) return;

    var formOptions = registerForm.querySelector('#kc-form-options');
    if (!formOptions || !formOptions.parentNode) return;

    var headerHint = doc.querySelector('.login-pf-header > div:last-child > .subtitle');
    if (!headerHint) return;

    if (headerHint.parentNode === formOptions.parentNode && headerHint.nextElementSibling === formOptions) {
      return;
    }

    headerHint.classList.add('timeline-required-hint');
    formOptions.parentNode.insertBefore(headerHint, formOptions);
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
    disableAutofocus();
    fixPasswordToggleControls();
    moveRegisterRequiredHint();

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
