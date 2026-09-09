import {it,expect,vi,afterEach} from 'vitest';
import {workoutPhotoFile,exportWorkoutPhoto} from './exportWorkoutPhoto.js';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it.each(['image/jpeg','image/png'])('preserves stored bytes/type: %s',async type=>{
 const file=workoutPhotoFile(new Blob(['original-bytes'],{type}),'2026-09-09');
 expect(file.size).toBe(14);expect(file.type).toBe(type);expect(file.name).toMatch(/^ROOK-workout-2026-09-09\.(jpg|png)$/);
});
it('uses file sharing without upload',async()=>{const share=vi.fn().mockResolvedValue();vi.stubGlobal('navigator',{canShare:()=>true,share});const file=workoutPhotoFile(new Blob(['x'],{type:'image/jpeg'}));expect(await exportWorkoutPhoto(file)).toBe('shared');expect(share).toHaveBeenCalledWith({files:[file]});});
it('does not download on cancellation',async()=>{vi.stubGlobal('navigator',{canShare:()=>true,share:vi.fn().mockRejectedValue(new DOMException('Cancelled','AbortError'))});expect(await exportWorkoutPhoto(new File(['x'],'a.jpg'))).toBe('cancelled');});
it('reports failures rather than claiming success',async()=>{vi.stubGlobal('navigator',{canShare:()=>true,share:vi.fn().mockRejectedValue(new Error('failed'))});await expect(exportWorkoutPhoto(new File(['x'],'a.jpg'))).rejects.toThrow('failed');});
it('rejects missing/unsupported assets',()=>{expect(()=>workoutPhotoFile(null)).toThrow();expect(()=>workoutPhotoFile(new Blob([],{type:'image/jpeg'}))).toThrow();expect(()=>workoutPhotoFile(new Blob(['x'],{type:'text/plain'}))).toThrow();});
