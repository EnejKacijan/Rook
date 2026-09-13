// Job-local diagnostics contain counts/timings only, never source content.
export function createImportTiming(onProgress = () => {}) {
  const stages = {};
  const start = performance.now();
  let activeStage=null;
  const begin = (stage, count = 1) => {
    if(activeStage!==stage){activeStage=stage;onProgress({ stage, count });}
    const started = performance.now();
    return () => {
      const previous = stages[stage] || { calls: 0, inputs: 0, milliseconds: 0 };
      stages[stage] = { calls: previous.calls + 1, inputs: previous.inputs + count, milliseconds: previous.milliseconds + performance.now() - started };
    };
  };
  return { begin, snapshot: () => ({ milliseconds: performance.now() - start, stages: structuredClone(stages) }) };
}
