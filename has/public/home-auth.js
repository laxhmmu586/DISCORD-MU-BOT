(() => {
  const redirectToLogin = () => {
    document.documentElement.classList.add('home-auth-pending');
    location.replace('/has-login.html');
  };
  if (!window.firebase?.apps?.length || typeof window.firebase.auth !== 'function') {
    redirectToLogin();
    return;
  }
  window.firebase.auth().onAuthStateChanged(user => {
    if (!user) {
      redirectToLogin();
      return;
    }
    document.documentElement.classList.remove('home-auth-pending');
  }, redirectToLogin);
})();
