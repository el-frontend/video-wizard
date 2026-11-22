// Expose HTTP 202 headers before the caller can finish reading its accepted job ID.
export function acceptedJobResponse(jobId: string) {
  let deliver!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      deliver = () => {
        controller.enqueue(
          new TextEncoder().encode(JSON.stringify({ success: true, data: { jobId } }))
        );
        controller.close();
      };
    },
  });
  return { response: new Response(body, { status: 202 }), deliver };
}
