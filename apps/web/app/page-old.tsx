import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card } from '@workspace/ui/components/card';
import Link from 'next/link';

export default function Page() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-6xl">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Video Wizard
        </h1>
        <p className="text-xl text-gray-600 mb-6">
          Transforma tus videos largos en clips virales con IA
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Badge variant="outline" className="text-sm">GPT-4o</Badge>
          <Badge variant="outline" className="text-sm">Whisper AI</Badge>
          <Badge variant="outline" className="text-sm">Transcripción Automática</Badge>
          <Badge variant="outline" className="text-sm">Análisis Viral</Badge>
        </div>
      </div>

      {/* Main Features Grid */}
      <div className="grid md:grid-cols-2 gap-8 mb-12">
        {/* Video Wizard - Full Pipeline */}
        <Card className="p-8 hover:shadow-2xl transition-all duration-300 border-2 border-blue-200">
          <div className="mb-4">
            <div className="text-5xl mb-4">🎬</div>
            <h2 className="text-2xl font-bold mb-2">Video Wizard</h2>
            <Badge className="mb-4">Recomendado</Badge>
          </div>
          
          <p className="text-gray-600 mb-6">
            Flujo completo automatizado: sube tu video, extrae audio, genera subtítulos 
            y descubre clips virales con IA.
          </p>

          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-green-500">✓</span>
              <span>Upload de video directo</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-green-500">✓</span>
              <span>Transcripción automática con timestamps</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-green-500">✓</span>
              <span>Análisis de IA para clips virales</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-green-500">✓</span>
              <span>Todo en un solo flujo</span>
            </div>
          </div>

          <Link href="/video-wizard">
            <Button className="w-full" size="lg">
              Comenzar 🚀
            </Button>
          </Link>
        </Card>

        {/* Content Intelligence - Manual Analysis */}
        <Card className="p-8 hover:shadow-2xl transition-all duration-300">
          <div className="mb-4">
            <div className="text-5xl mb-4">🤖</div>
            <h2 className="text-2xl font-bold mb-2">Content Intelligence</h2>
            <Badge variant="outline" className="mb-4">Solo Análisis</Badge>
          </div>
          
          <p className="text-gray-600 mb-6">
            ¿Ya tienes una transcripción? Analízala directamente con GPT-4o 
            para encontrar los mejores clips virales.
          </p>

          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-blue-500">✓</span>
              <span>Análisis de transcripciones existentes</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-blue-500">✓</span>
              <span>Puntuación viral (0-100)</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-blue-500">✓</span>
              <span>Identificación de hooks y conclusiones</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-blue-500">✓</span>
              <span>Transcripción de ejemplo incluida</span>
            </div>
          </div>

          <Link href="/content-intelligence">
            <Button variant="outline" className="w-full" size="lg">
              Analizar Transcripción
            </Button>
          </Link>
        </Card>
      </div>

      {/* How It Works */}
      <Card className="p-8 bg-gradient-to-br from-gray-50 to-blue-50">
        <h2 className="text-2xl font-bold mb-6 text-center">¿Cómo Funciona?</h2>
        
        <div className="grid md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-4xl mb-3">📤</div>
            <h3 className="font-semibold mb-2">1. Sube</h3>
            <p className="text-sm text-gray-600">
              Sube tu video (MP4, MOV, etc.) o pega una transcripción
            </p>
          </div>

          <div className="text-center">
            <div className="text-4xl mb-3">🎙️</div>
            <h3 className="font-semibold mb-2">2. Transcribe</h3>
            <p className="text-sm text-gray-600">
              Whisper AI extrae audio y genera subtítulos con timestamps
            </p>
          </div>

          <div className="text-center">
            <div className="text-4xl mb-3">🤖</div>
            <h3 className="font-semibold mb-2">3. Analiza</h3>
            <p className="text-sm text-gray-600">
              GPT-4o identifica clips virales basados en hooks y engagement
            </p>
          </div>

          <div className="text-center">
            <div className="text-4xl mb-3">🎬</div>
            <h3 className="font-semibold mb-2">4. Exporta</h3>
            <p className="text-sm text-gray-600">
              Obtén timestamps y scores para editar tus clips
            </p>
          </div>
        </div>
      </Card>

      {/* Tech Stack */}
      <div className="mt-12 text-center">
        <p className="text-sm text-gray-500 mb-3">Construido con</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Badge variant="outline">Next.js 16</Badge>
          <Badge variant="outline">React 19</Badge>
          <Badge variant="outline">TypeScript</Badge>
          <Badge variant="outline">Python FastAPI</Badge>
          <Badge variant="outline">OpenAI GPT-4o</Badge>
          <Badge variant="outline">Whisper AI</Badge>
          <Badge variant="outline">Vercel AI SDK</Badge>
          <Badge variant="outline">Tailwind CSS</Badge>
        </div>
      </div>
    </div>
  );
}