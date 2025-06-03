function loadReactScript(script: HTMLScriptElement) {
  return new Promise(resolve => {
    const newScript = document.createElement('script');
    newScript.type = 'text/javascript';
    newScript.src = script.src;
    newScript.onload = resolve;
    document.body.append(newScript);
    script.remove();
  });
}

export function loadReactScripts() {
  const reactScripts = document.querySelectorAll<HTMLScriptElement>('script[type=module]');
  return Promise.all(Array.from(reactScripts).map(loadReactScript));
}
