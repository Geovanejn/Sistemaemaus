import type { Context } from 'hono';
import type { R2Bucket, R2ObjectBody, R2Object } from '@cloudflare/workers-types';

/**
 * R2Storage - Gerenciamento de fotos de membros usando Cloudflare R2
 * 
 * ✅ USA BINDING NATIVO (env.STORAGE)
 * ❌ NÃO USA AWS SDK
 * 
 * IMPORTANTE: 
 * - Cloudflare Workers usa R2 binding nativo, não AWS SDK
 * - Todas as operações usam env.STORAGE.put/get/delete diretamente
 * - Fotos são armazenadas com key pattern: photos/{userId}-{timestamp}.jpg
 * 
 * @example Uso básico
 * ```typescript
 * const r2 = new R2Storage(env.STORAGE);
 * const key = await r2.uploadPhoto(userId, arrayBuffer, 'image/jpeg');
 * const photo = await r2.getPhoto(key);
 * await r2.deletePhoto(key);
 * ```
 */
export class R2Storage {
  private bucket: R2Bucket;

  /**
   * Construtor - recebe R2Bucket binding do ambiente Worker
   * @param r2Bucket - Binding R2 do wrangler.toml (env.STORAGE)
   */
  constructor(r2Bucket: R2Bucket) {
    this.bucket = r2Bucket;
  }

  /**
   * Upload de foto de membro usando R2 binding nativo
   * 
   * Pattern de key: photos/{userId}-{timestamp}.jpg
   * Formato suportado: JPEG (outros formatos podem ser adicionados)
   * 
   * @param userId - ID do membro que terá a foto
   * @param fileData - Dados da foto em ArrayBuffer (do FormData)
   * @param contentType - MIME type da imagem (ex: 'image/jpeg', 'image/png')
   * @returns Key da foto armazenada no R2 (ex: "photos/1-1731609234567.jpg")
   * 
   * @throws Error se upload falhar
   * 
   * @example
   * ```typescript
   * const formData = await c.req.formData();
   * const file = formData.get('photo') as File;
   * const buffer = await file.arrayBuffer();
   * const key = await r2.uploadPhoto(userId, buffer, file.type);
   * // Retorna: "photos/1-1731609234567.jpg"
   * ```
   */
  async uploadPhoto(
    userId: number, 
    fileData: ArrayBuffer, 
    contentType: string
  ): Promise<string> {
    // Validar MIME type suportado (validação client-side)
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!supportedTypes.includes(contentType.toLowerCase())) {
      throw new Error(`Unsupported image format: ${contentType}. Supported formats: ${supportedTypes.join(', ')}`);
    }
    
    // Validar tamanho máximo (10MB - limite Workers)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (fileData.byteLength > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${(fileData.byteLength / 1024 / 1024).toFixed(2)}MB. Maximum allowed: 10MB`);
    }
    
    if (fileData.byteLength === 0) {
      throw new Error('File is empty');
    }
    
    // Gerar key única: photos/{userId}-{timestamp}.{ext}
    const timestamp = Date.now();
    let extension = 'jpg';
    if (contentType === 'image/png') extension = 'png';
    else if (contentType === 'image/webp') extension = 'webp';
    
    const key = `photos/${userId}-${timestamp}.${extension}`;
    
    console.log(`[R2] Uploading photo: ${key} (${(fileData.byteLength / 1024).toFixed(2)}KB, ${contentType})`);
    
    try {
      // ✅ CORRETO: Usar binding nativo R2
      // Método put() do R2Bucket aceita ArrayBuffer diretamente
      await this.bucket.put(key, fileData, {
        httpMetadata: {
          contentType: contentType,
        },
        customMetadata: {
          userId: userId.toString(),
          uploadedAt: new Date().toISOString(),
        },
      });

      console.log(`[R2] ✅ Photo uploaded successfully: ${key}`);
      return key;
    } catch (error) {
      // Erros do R2 (storage failure) - 500
      console.error('[R2] ❌ Error uploading to R2:', error);
      throw new Error(`Failed to upload photo to storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Buscar foto do R2
   * 
   * @param key - Chave da foto no R2 (ex: "photos/1-1731609234567.jpg")
   * @returns R2ObjectBody com a foto ou null se não encontrada
   * 
   * @example
   * ```typescript
   * const photo = await r2.getPhoto('photos/1-1731609234567.jpg');
   * if (photo) {
   *   const arrayBuffer = await photo.arrayBuffer();
   *   const blob = await photo.blob();
   * }
   * ```
   */
  async getPhoto(key: string): Promise<R2ObjectBody | null> {
    try {
      console.log(`[R2] Fetching photo: ${key}`);
      
      // ✅ CORRETO: Usar binding nativo R2
      const object = await this.bucket.get(key);
      
      if (!object) {
        console.log(`[R2] Photo not found: ${key}`);
        return null;
      }
      
      console.log(`[R2] ✅ Photo found: ${key} (${object.size} bytes)`);
      return object;
    } catch (error) {
      console.error(`[R2] ❌ Error getting photo ${key}:`, error);
      // Rethrow erro original para upstream handlers distinguirem 404s de erros transientes
      throw error;
    }
  }

  /**
   * Deletar foto do R2
   * 
   * IMPORTANTE: Esta operação é DESTRUTIVA e IRREVERSÍVEL
   * Certifique-se de ter backup ou confirmação antes de deletar
   * 
   * @param key - Chave da foto a ser deletada
   * @throws Error se delete falhar
   * 
   * @example
   * ```typescript
   * await r2.deletePhoto('photos/1-1731609234567.jpg');
   * ```
   */
  async deletePhoto(key: string): Promise<void> {
    try {
      console.log(`[R2] Deleting photo: ${key}`);
      
      // ✅ CORRETO: Usar binding nativo R2
      await this.bucket.delete(key);
      
      console.log(`[R2] ✅ Photo deleted successfully: ${key}`);
    } catch (error) {
      console.error(`[R2] ❌ Error deleting photo ${key}:`, error);
      throw new Error(`Failed to delete photo: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gerar URL pública da foto
   * 
   * OPÇÕES DE CONFIGURAÇÃO:
   * 
   * Opção 1 (Recomendada): Domínio público R2
   * - Configurar em: Cloudflare Dashboard → R2 → Bucket → Settings → Public Access
   * - Adicionar domínio customizado (ex: cdn.seudominio.com)
   * - Retorna URL pública direta (mais rápido, cached na CDN)
   * 
   * Opção 2 (Mais segura): Worker route
   * - Servir fotos através do Worker (GET /photos/:key)
   * - Permite adicionar autenticação/autorização
   * - Controle de cache customizado
   * 
   * @param key - Chave da foto no R2
   * @returns URL pública para acessar a foto
   * 
   * @example
   * ```typescript
   * const url = r2.getPhotoUrl('photos/1-1731609234567.jpg');
   * // Opção 1: https://cdn.seudominio.com/photos/1-1731609234567.jpg
   * // Opção 2: https://emaus-vota.workers.dev/photos/photos/1-1731609234567.jpg
   * ```
   */
  getPhotoUrl(key: string, workerUrl?: string): string {
    // Opção 1: Domínio público R2 (requer configuração no dashboard)
    // Depois de configurar, atualizar com seu domínio real
    // return `https://cdn.seudominio.com/${key}`;
    
    // Opção 2: Workers route (funciona imediatamente)
    // Se workerUrl não fornecida, usa padrão workers.dev
    const baseUrl = workerUrl || 'https://emaus-vota.workers.dev';
    return `${baseUrl}/photos/${key}`;
  }
  
  /**
   * Rota Worker para servir fotos (Handler para GET /photos/:key)
   * 
   * Este método deve ser usado como handler na rota do Worker:
   * 
   * @example Uso em workers/index.ts
   * ```typescript
   * app.get('/photos/*', async (c) => {
   *   const key = c.req.param('*');
   *   const r2Storage = new R2Storage(c.env.STORAGE);
   *   return await r2Storage.servePhoto(c, key);
   * });
   * ```
   * 
   * @param c - Contexto Hono
   * @param key - Chave da foto (extraída da URL)
   * @returns Response com a foto ou 404
   */
  async servePhoto(c: Context, key: string): Promise<Response> {
    try {
      const object = await this.bucket.get(key);
      
      if (!object) {
        console.log(`[R2] Photo not found for serving: ${key}`);
        return new Response(JSON.stringify({ error: 'Photo not found' }), { 
          status: 404,
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store', // ✅ NÃO cachear erros 404
          },
        });
      }

      console.log(`[R2] Serving photo: ${key} (${object.size} bytes)`);

      // R2ObjectBody já tem body como ReadableStream
      const headers: Record<string, string> = {
        'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache 1 ano (fotos não mudam)
        'Content-Length': object.size.toString(),
      };
      
      // Adicionar ETag se disponível (para validação de cache)
      if (object.etag) {
        headers['ETag'] = object.etag;
      }
      
      // object.body já é ReadableStream, compatível com Response
      return new Response(object.body, { headers });
    } catch (error) {
      console.error(`[R2] ❌ Error serving photo ${key}:`, error);
      
      // Retornar 500 com cache headers apropriados
      return new Response(JSON.stringify({ 
        error: 'Failed to serve photo',
        message: error instanceof Error ? error.message : 'Unknown error',
      }), { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store', // ✅ NÃO cachear erros 500
        },
      });
    }
  }
  
  /**
   * Listar todas as fotos com prefix (útil para migração e debug)
   * 
   * @param prefix - Prefixo para filtrar (padrão: 'photos/')
   * @param limit - Número máximo de resultados (padrão: 1000)
   * @returns Array de keys encontradas
   * 
   * @example
   * ```typescript
   * const allPhotos = await r2.listPhotos('photos/');
   * console.log(`Total photos: ${allPhotos.length}`);
   * ```
   */
  async listPhotos(prefix: string = 'photos/', limit: number = 1000): Promise<string[]> {
    try {
      console.log(`[R2] Listing photos with prefix: ${prefix}`);
      
      const list = await this.bucket.list({ 
        prefix,
        limit,
      });
      
      const keys = list.objects.map(obj => obj.key);
      console.log(`[R2] Found ${keys.length} photos`);
      
      return keys;
    } catch (error) {
      console.error('[R2] ❌ Error listing photos:', error);
      return [];
    }
  }

  /**
   * Verificar se uma foto existe no R2
   * 
   * @param key - Chave da foto
   * @returns true se existe, false caso contrário
   */
  async photoExists(key: string): Promise<boolean> {
    try {
      const object = await this.bucket.head(key);
      return object !== null;
    } catch {
      return false;
    }
  }

  /**
   * Obter metadados de uma foto sem baixar o conteúdo
   * 
   * @param key - Chave da foto
   * @returns Metadados ou null se não encontrado
   */
  async getPhotoMetadata(key: string): Promise<R2Object | null> {
    try {
      return await this.bucket.head(key);
    } catch {
      return null;
    }
  }
}

/**
 * ========================
 * ❌ PADRÕES INCORRETOS (NÃO USE!)
 * ========================
 * 
 * // ❌ ERRADO 1: Usar AWS SDK (não funciona em Workers!)
 * // import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
 * // const s3 = new S3Client({...});  // Runtime error em Workers!
 * 
 * // ❌ ERRADO 2: Usar @hono/node-server (específico Node.js)
 * // import { serve } from '@hono/node-server';  // Não funciona em Workers!
 * 
 * // ❌ ERRADO 3: Instalar pacotes AWS
 * // npm install @aws-sdk/client-s3  // Não compatível com Workers runtime!
 * 
 * ========================
 * ✅ PADRÕES CORRETOS (USE!)
 * ========================
 * 
 * // ✅ CORRETO 1: Binding nativo em workers/index.ts
 * export interface Env {
 *   STORAGE: R2Bucket;  // Binding automático do wrangler.toml
 * }
 * 
 * // ✅ CORRETO 2: Usar na rota
 * app.post('/api/admin/members/:id/photo', async (c) => {
 *   const userId = parseInt(c.req.param('id'));
 *   const formData = await c.req.formData();
 *   const file = formData.get('photo') as File;
 *   
 *   const r2 = new R2Storage(c.env.STORAGE);
 *   const buffer = await file.arrayBuffer();
 *   const key = await r2.uploadPhoto(userId, buffer, file.type);
 *   
 *   return c.json({ photoKey: key, photoUrl: r2.getPhotoUrl(key) });
 * });
 * 
 * // ✅ CORRETO 3: Servir foto via Worker
 * app.get('/photos/*', async (c) => {
 *   const key = c.req.param('*');
 *   const r2 = new R2Storage(c.env.STORAGE);
 *   return await r2.servePhoto(c, key);
 * });
 */
