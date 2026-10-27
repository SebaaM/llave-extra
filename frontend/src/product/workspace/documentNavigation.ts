export function openAdmin(replace = false) {
  if (replace) window.location.replace('/admin/')
  else window.location.assign('/admin/')
}
