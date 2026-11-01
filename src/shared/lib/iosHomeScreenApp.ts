/**
 * A Home Screen app on iOS blurs the strip under the status bar, and the blur
 * fades about 20pt down into the page: the buttons of the top bars sat in it.
 * The class lets the CSS start those bars lower (`--ios-edge-blur-gap`).
 * `navigator.standalone` exists only on iOS and is true only in a Home Screen
 * app, so Safari tabs, Android and desktop keep their layout.
 */
export const IOS_HOME_SCREEN_APP_CLASS = 'ios-home-screen-app';

export const markIosHomeScreenApp = (
  nav: Navigator = navigator,
  root: HTMLElement = document.documentElement,
): void => {
  if ((nav as Navigator & { standalone?: boolean }).standalone === true) {
    root.classList.add(IOS_HOME_SCREEN_APP_CLASS);
  }
};
