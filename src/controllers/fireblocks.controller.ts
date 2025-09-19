import {getModelSchemaRef, post, requestBody} from '@loopback/rest';
import {getLogger, Logger} from 'log4js';
import * as https from 'https';
import {FireblocksGenericRequest, FireblocksGenericResponse} from '../models';
import { sanitizeLogMessage } from '../utils/sanitization-utils';

export class FireblocksController {
  logger: Logger;

  constructor() {
    this.logger = getLogger('fireblocks-controller');
  }

  @post('/fireblocks/generic-post', {
    responses: {
      '200': {
        description: 'Fireblocks Generic POST Response',
        content: {
          'application/json': {
            schema: getModelSchemaRef(FireblocksGenericResponse),
          },
        },
      },
    },
  })
  async genericPost(
    @requestBody({
      content: {'application/json': {schema: getModelSchemaRef(FireblocksGenericRequest)}},
    })
    req: FireblocksGenericRequest,
  ): Promise<FireblocksGenericResponse> {
    this.logger.debug('[genericPost] started');
    
    return new Promise<FireblocksGenericResponse>((resolve, reject) => {
      try {
        this.logger.trace('[genericPost] Processing request');
        this.logger.trace(`[genericPost] Body data: ${JSON.stringify(req.bodyData)}`);

        const baseUrl = 'https://api.fireblocks.io';
        const fullUrl = `${baseUrl}${req.uri}`;
        const url = new URL(fullUrl);

        const headers = {
          'X-API-Key': req.apiKey,
          'Authorization': `Bearer ${req.jwt}`,
          'Content-Type': 'application/json',
        };

        const postData = req.bodyData ? JSON.stringify(req.bodyData) : '';

        const options = {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            ...headers,
            'Content-Length': Buffer.byteLength(postData),
          },
        };

        const httpsRequest = https.request(options, (response: any) => {
          let data = '';
          response.on('data', (chunk: any) => {
            data += chunk;
          });
          response.on('end', () => {
            try {
              const responseData = JSON.parse(data);
              this.logger.trace(`[genericPost] Response status: ${response.statusCode}`);
              
              const fireblocksResponse = new FireblocksGenericResponse({
                data: responseData,
                statusCode: response.statusCode,
              });
              resolve(fireblocksResponse);
            } catch (parseError) {
              this.logger.warn(`[genericPost] Failed to parse response. error: ${parseError}`);
              const errorResponse = new FireblocksGenericResponse({
                error: 'Failed to parse response',
                statusCode: response.statusCode || 500,
              });
              reject(errorResponse);
            }
          });
        });

        httpsRequest.on('error', (error: any) => {
          const sanitizedErrorMsg = sanitizeLogMessage(error instanceof Error ? error.message : String(error));
          this.logger.warn(`[genericPost] Request failed. error: ${sanitizedErrorMsg}`);
          const errorResponse = new FireblocksGenericResponse({
            error: sanitizedErrorMsg,
            statusCode: 500,
          });
          reject(errorResponse);
        });

        httpsRequest.write(postData);
        httpsRequest.end();
      } catch (error) {
        const sanitizedErrorMsg = sanitizeLogMessage(error instanceof Error ? error.message : String(error));
        this.logger.warn(`[genericPost] Something went wrong. error: ${sanitizedErrorMsg}`);
        const errorResponse = new FireblocksGenericResponse({
          error: sanitizedErrorMsg,
          statusCode: 500,
        });
        reject(errorResponse);
      }
    });
  }

  @post('/fireblocks/generic-get', {
    responses: {
      '200': {
        description: 'Fireblocks Generic GET Response',
        content: {
          'application/json': {
            schema: getModelSchemaRef(FireblocksGenericResponse),
          },
        },
      },
    },
  })
  async genericGet(
    @requestBody({
      content: {'application/json': {schema: getModelSchemaRef(FireblocksGenericRequest)}},
    })
    req: FireblocksGenericRequest,
  ): Promise<FireblocksGenericResponse> {
    this.logger.debug('[genericGet] started');
    
    return new Promise<FireblocksGenericResponse>((resolve, reject) => {
      try {
        this.logger.trace('[genericGet] Processing request');

        const baseUrl = 'https://api.fireblocks.io';
        const fullUrl = `${baseUrl}${req.uri}`;
        const url = new URL(fullUrl);

        const headers = {
          'X-API-Key': req.apiKey,
          'Authorization': `Bearer ${req.jwt}`,
          'Content-Type': 'application/json',
        };

        const options = {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: 'GET',
          headers,
        };

        const httpsRequest = https.request(options, (response: any) => {
          let data = '';
          response.on('data', (chunk: any) => {
            data += chunk;
          });
          response.on('end', () => {
            try {
              const responseData = JSON.parse(data);
              this.logger.trace(`[genericGet] Response status: ${response.statusCode}`);
              
              const fireblocksResponse = new FireblocksGenericResponse({
                data: responseData,
                statusCode: response.statusCode,
              });
              resolve(fireblocksResponse);
            } catch (parseError) {
              this.logger.warn(`[genericGet] Failed to parse response. error: ${parseError}`);
              const errorResponse = new FireblocksGenericResponse({
                error: 'Failed to parse response',
                statusCode: response.statusCode || 500,
              });
              reject(errorResponse);
            }
          });
        });

        httpsRequest.on('error', (error: any) => {
          const sanitizedErrorMsg = sanitizeLogMessage(error instanceof Error ? error.message : String(error));
          this.logger.warn(`[genericGet] Request failed. error: ${sanitizedErrorMsg}`);
          const errorResponse = new FireblocksGenericResponse({
            error: sanitizedErrorMsg,
            statusCode: 500,
          });
          reject(errorResponse);
        });

        httpsRequest.end();
      } catch (error) {
        const sanitizedErrorMsg = sanitizeLogMessage(error instanceof Error ? error.message : String(error));
        this.logger.warn(`[genericGet] Something went wrong. error: ${sanitizedErrorMsg}`);
        const errorResponse = new FireblocksGenericResponse({
          error: sanitizedErrorMsg,
          statusCode: 500,
        });
        reject(errorResponse);
      }
    });
  }
}
