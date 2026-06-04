// jsdom 不实现 scrollTo，在此 mock 以避免 Unhandled Rejection
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = () => {};
}
