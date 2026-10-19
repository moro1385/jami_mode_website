import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn(), from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: m.from } } }));
import { returnImagePath, signedReturnImage, uploadReturnImages, validateReturnImage } from '@/lib/returnImages';
const user = '10000000-0000-0000-0000-000000000001';
beforeEach(() => { vi.resetAllMocks(); m.from.mockReturnValue(m); m.upload.mockResolvedValue({ error: null }); m.remove.mockResolvedValue({ error: null }); });
describe('private return images', () => {
 it('accepts owned object paths and converts same-project legacy public URLs without loading them', () => {
  expect(returnImagePath(user + '/0.123.jpg')).toBe(user + '/0.123.jpg');
  expect(returnImagePath('https://klfmscuogsocfjxqkuib.supabase.co/storage/v1/object/public/return-request-images/' + user + '/0.123.jpg')).toBe(user + '/0.123.jpg');
 });
 it.each(['https://evil.invalid/a.jpg','javascript:alert(1)', user + '/../a.jpg', user + '/a.svg', user + '/%2fsecret.jpg'])('rejects hostile references %s', value => expect(returnImagePath(value)).toBeNull());
 it('asks the authorized Storage API for a 60-second URL', async () => { m.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'signed-fixture' } }); expect(await signedReturnImage(user + '/image.jpg')).toBe('signed-fixture'); expect(m.createSignedUrl).toHaveBeenCalledWith(user + '/image.jpg',60); });
 it('does not sign arbitrary external URLs', async () => { expect(await signedReturnImage('https://evil.invalid/pixel')).toBeNull(); expect(m.createSignedUrl).not.toHaveBeenCalled(); });
 it('stores object paths and never asks for public URLs', async () => {
  const paths = await uploadReturnImages(user,[new File(['fixture'],'unsafe.html',{type:'image/png'})]);
  expect(paths[0]).toMatch(new RegExp('^'+user+'/[0-9a-f-]{36}\\.png$'));
  expect(m.upload).toHaveBeenCalledWith(paths[0],expect.any(File),{upsert:false,contentType:'image/png'});
 });
 it('cleans partial uploads on a definite upload rejection', async () => {
  m.upload.mockResolvedValueOnce({error:null}).mockResolvedValueOnce({error:{message:'denied'}});
  await expect(uploadReturnImages(user,[new File(['a'],'a.jpg',{type:'image/jpeg'}),new File(['b'],'b.jpg',{type:'image/jpeg'})])).rejects.toThrow();
  expect(m.remove).toHaveBeenCalledWith([expect.stringContaining(user+'/')]);
 });
 it('rejects SVG, zero-length, too large or too many files before uploading', async () => {
  expect(()=>validateReturnImage(new File(['svg'],'a.svg',{type:'image/svg+xml'}))).toThrow();
  expect(()=>validateReturnImage(new File([],'a.png',{type:'image/png'}))).toThrow();
  await expect(uploadReturnImages(user,Array.from({length:6},()=>new File(['a'],'a.jpg',{type:'image/jpeg'})))).rejects.toThrow(); expect(m.upload).not.toHaveBeenCalled();
 });
});
