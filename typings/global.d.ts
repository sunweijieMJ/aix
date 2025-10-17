declare global {
  interface Window {
    //
  }
}

interface Performance {
  memory: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}
