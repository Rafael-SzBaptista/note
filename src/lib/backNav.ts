import { useEffect, useRef } from 'react';

/**
 * Liga o botão "voltar" do celular/navegador às camadas do app (telas, menu, diálogos).
 * `depth` é o número de camadas abertas; cada uma ganha uma entrada no histórico.
 * Ao voltar, `close(n)` fecha as `n` camadas de cima; quando `depth` cai por outro motivo
 * (ex.: botão fechar da tela), o histórico é desfeito para acompanhar.
 */
export function useBackNavigation(depth: number, close: (n: number) => void) {
  const hist = useRef(0); // entradas de histórico que o app criou e ainda estão ativas
  const ignorePop = useRef(false);
  const depthRef = useRef(depth);
  const closeRef = useRef(close);
  depthRef.current = depth;
  closeRef.current = close;

  useEffect(() => {
    history.replaceState({ d: 0 }, '');
    hist.current = 0;
    const onPop = (e: PopStateEvent) => {
      if (ignorePop.current) {
        ignorePop.current = false;
        return;
      }
      const target = (e.state?.d as number | undefined) ?? 0;
      // sobrou entrada antiga (ex.: após recarregar a página): pula até o início
      if (target > 0 && depthRef.current === 0) {
        hist.current = target;
        history.back();
        return;
      }
      const n = hist.current - target;
      hist.current = target;
      if (n > 0) closeRef.current(Math.min(n, depthRef.current));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (depth > hist.current) {
      while (hist.current < depth) history.pushState({ d: ++hist.current }, '');
    } else if (depth < hist.current) {
      const n = hist.current - depth;
      hist.current = depth;
      ignorePop.current = true;
      history.go(-n);
    }
  }, [depth]);
}
