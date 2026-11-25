import type { CompanionRequest } from '@workspace/video-project';
import { componentInstruction } from './component';
import { storyboardInstruction } from './storyboard';
import { voiceInstruction } from './voice';
export function instructionFor(request: CompanionRequest) {
  const task = {
    feedback:
      'Confirma la edición con el usuario y cambia solo el texto seleccionado mediante feedback.',
    component: componentInstruction,
    storyboard: storyboardInstruction,
    voice: voiceInstruction,
    shorts:
      'Lee la fuente medida y su transcripción mediante source. Propón intervalos enteros del video de origen mediante ranges. El usuario revisa e importa la selección en Shorts.',
  }[request.kind];
  return (
    'Usa node scripts/local-studio.mjs companion action ' +
    request.id +
    ' read para leer la revisión actual. Mantén la base fijada y opera por este cliente local autorizado. ' +
    task +
    ' Registra el resultado mediante status. La aceptación en cola no aprueba aplicar cambios.'
  );
}
