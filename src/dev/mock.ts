// Bridge falso para la vista previa en el PC. Las claves son URIs completas.
export function installMock(handlers: Record<string, (p: any) => any>): void {
  if (window.PalmServiceBridge) return;
  class MockBridge {
    onservicecallback: ((msg: string) => void) | null = null;
    call(uri: string, params: string): void {
      let p: any = {};
      try { p = JSON.parse(params); } catch (e) { /* parámetros vacíos */ }
      const h = handlers[uri];
      let res: any;
      try {
        res = h ? h(p) : { returnValue: false, errorText: 'mock: no handler' };
      } catch (e) {
        res = { returnValue: false, errorText: 'mock: ' + String(e) };
      }
      setTimeout(() => {
        if (this.onservicecallback) this.onservicecallback(JSON.stringify(res));
      }, 0);
    }
    cancel(): void { this.onservicecallback = null; }
  }
  window.PalmServiceBridge = MockBridge;
}
