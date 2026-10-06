// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { installBrowserThemeColor } from '../../src/lib/browserThemeColor'
let stop=()=>{}
afterEach(()=>{stop();document.head.innerHTML='';delete document.documentElement.dataset.theme})
it('synchronizes initial state and later theme changes',async()=>{
  document.head.innerHTML='<meta name="theme-color" content="#0f172a">'
  document.documentElement.dataset.theme='dark'
  stop=installBrowserThemeColor(document)
  const meta=document.querySelector('meta')!
  expect(meta.content).toBe('#08111f')
  document.documentElement.dataset.theme='light';await Promise.resolve()
  expect(meta.content).toBe('#f8fafc')
  stop();document.documentElement.dataset.theme='dark';await Promise.resolve()
  expect(meta.content).toBe('#f8fafc')
})
it('is safe when metadata or observer support is missing',()=>{
  stop=installBrowserThemeColor(document)
  document.head.innerHTML='<meta name="theme-color">'
  stop=installBrowserThemeColor(document,null)
  expect(document.querySelector('meta')!.content).toBe('#f8fafc')
})
