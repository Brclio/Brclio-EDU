/** Native dialogs run in the trusted parent; previews retain their opaque sandbox. */
export function installNativePreviewDialogs(getFrame: () => Window | null | undefined, channel: string) {
  const receive = (event: MessageEvent) => {
    const target = getFrame(), data = event.data;
    if (!target || event.source !== target || event.origin !== 'null' || data?.__eduPreviewDialog !== channel || !Number.isSafeInteger(data.id) || data.id < 1 || !['alert','prompt','confirm'].includes(data.kind)) return;
    const message = data.message === undefined ? '' : String(data.message);
    let value: string | boolean | null | undefined;
    if (data.kind === 'prompt') value = window.prompt(message, data.value === undefined ? '' : String(data.value));
    else if (data.kind === 'confirm') value = window.confirm(message);
    else window.alert(message);
    if (getFrame() === target) target.postMessage({__eduPreviewDialogResponse:channel,id:data.id,value},'*');
  };
  window.addEventListener('message',receive);
  return () => window.removeEventListener('message',receive);
}
