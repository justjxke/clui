export function formatAccelerator(accelerator: string): string {
  return accelerator
    .replace(/CommandOrControl/g, 'Cmd')
    .replace(/Control/g, 'Ctrl')
    .replace(/Alt/g, 'Option')
    .replace(/\+/g, ' + ')
}
