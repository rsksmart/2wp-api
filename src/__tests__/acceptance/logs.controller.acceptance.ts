import {Client, expect} from '@loopback/testlab';
import {TwpapiApplication} from '../..';
import {setupApplication} from './test-helper';

describe('LogsController:', () => {
  let app: TwpapiApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  describe('POST /logs', () => {
    describe('type attribute validation', () => {
      it('should accept valid type values', async () => {
        const validTypes = ['peginNative', 'peginFlyover', 'pegoutNative', 'pegoutFlyover'];
        
        for (const type of validTypes) {
          const requestBody = {
            type,
            operation: 'success',
            location: 'test-location',
          };

          await client
            .post('/logs')
            .send(requestBody)
            .expect(200);
        }
      });

      it('should reject invalid type values', async () => {
        const invalidTypes = ['invalidType', 'pegin', 'pegout', 'native', 'flyover', '', null, undefined, 123];
        
        for (const type of invalidTypes) {
          const requestBody = {
            type,
            operation: 'success',
            location: 'test-location',
          };

          await client
            .post('/logs')
            .send(requestBody)
            .expect(422);
        }
      });
    });

    describe('operation attribute validation', () => {
      it('should accept valid operation values', async () => {
        const validOperations = ['success', 'error'];
        
        for (const operation of validOperations) {
          const requestBody = {
            type: 'peginNative',
            operation,
            location: 'test-location',
          };

          await client
            .post('/logs')
            .send(requestBody)
            .expect(200);
        }
      });

      it('should reject invalid operation values', async () => {
        const invalidOperations = ['invalid', 'successful', 'failed', 'pending', '', null, undefined, 123];
        
        for (const operation of invalidOperations) {
          const requestBody = {
            type: 'peginNative',
            operation,
            location: 'test-location',
          };

          await client
            .post('/logs')
            .send(requestBody)
            .expect(422);
        }
      });
    });

    describe('location attribute validation', () => {
      it('should accept valid location values within boundaries', async () => {
        const validLocations = [
          'abc', // minimum length (3)
          'test-location', // valid pattern with single hyphen
          'test_location', // valid pattern with underscore
          'Test Location', // valid pattern with space
          'test123', // valid pattern with numbers
          'test-multiple-hyphens', // valid pattern with multiple single hyphens
          'test_hyphen-space', // valid pattern with hyphen and space
          'a'.repeat(50), // maximum length (50)
        ];
        
        for (const location of validLocations) {
          const requestBody = {
            type: 'peginNative',
            operation: 'success',
            location,
          };

          await client
            .post('/logs')
            .send(requestBody)
            .expect(200);
        }
      });

      it('should reject invalid location values', async () => {
        const invalidLocations = [
          'ab', // too short (minLength: 3)
          'a'.repeat(51), // too long (maxLength: 50)
          'test@location', // invalid character (@)
          'test.location', // invalid character (.)
          'test/location', // invalid character (/)
          'test\\location', // invalid character (\)
          'test+location', // invalid character (+)
          'test=location', // invalid character (=)
          'test--location', // invalid double hyphen
          '--test', // double hyphen at start
          'test--', // double hyphen at end
          'test---location', // triple hyphen
          'test--multiple--hyphens', // multiple double hyphens
          '', // empty string
          null,
          undefined,
          123,
        ];
        
        for (const location of invalidLocations) {
          const requestBody = {
            type: 'peginNative',
            operation: 'success',
            location,
          };

          await client
            .post('/logs')
            .send(requestBody)
            .expect(422);
        }
      });
    });

    describe('error attribute validation', () => {
      it('should accept valid error objects', async () => {
        const validErrors = [
          {
            message: 'abc', // minimum length (3)
            code: 100,
          },
          {
            message: 'test-error-message', // valid pattern with hyphen
            code: 404,
          },
          {
            message: 'test_error_message', // valid pattern with underscore
            code: 500,
          },
          {
            message: 'Test Error Message', // valid pattern with space
            code: 0,
          },
          {
            message: 'test123', // valid pattern with numbers
            code: -1,
          },
          {
            message: 'a'.repeat(30), // maximum length (30)
            code: 999999,
          },
        ];
        
        for (const error of validErrors) {
          const requestBody = {
            type: 'peginNative',
            operation: 'error',
            location: 'test-location',
            error,
          };

          await client
            .post('/logs')
            .send(requestBody)
            .expect(200);
        }
      });

      it('should reject invalid error objects', async () => {
        const invalidErrors = [
          'not-an-object',
          123,
          [],
        ];
        
        for (const error of invalidErrors) {
          const requestBody = {
            type: 'peginNative',
            operation: 'error',
            location: 'test-location',
            error,
          };

          await client
            .post('/logs')
            .send(requestBody)
            .expect(422);
        }
      });
    });

    describe('required fields validation', () => {
      it('should reject requests missing required fields', async () => {
        const incompleteRequests = [
          // Missing type
          {
            operation: 'success',
            location: 'test-location',
          },
          // Missing operation
          {
            type: 'peginNative',
            location: 'test-location',
          },
          // Missing location
          {
            type: 'peginNative',
            operation: 'success',
          },
          // Empty request
          {},
        ];
        
        for (const requestBody of incompleteRequests) {
          await client
            .post('/logs')
            .send(requestBody)
            .expect(422);
        }
      });
    });

    describe('optional error field', () => {
      it('should accept requests without error field', async () => {
        const requestBody = {
          type: 'peginNative',
          operation: 'success',
          location: 'test-location',
        };

        await client
          .post('/logs')
          .send(requestBody)
          .expect(200);
      });

      it('should accept requests with undefined error field', async () => {
        const requestBody = {
          type: 'peginNative',
          operation: 'success',
          location: 'test-location',
          error: undefined,
        };

        await client
          .post('/logs')
          .send(requestBody)
          .expect(200);
      });
    });

    describe('additional properties validation', () => {
      it('should reject requests with additional properties', async () => {
        const requestBody = {
          type: 'peginNative',
          operation: 'success',
          location: 'test-location',
          extraProperty: 'should-not-be-allowed',
          anotherProperty: 123,
        };

        await client
          .post('/logs')
          .send(requestBody)
          .expect(422);
      });

    });

    describe('data type validation', () => {
      it('should reject requests with wrong data types', async () => {
        const invalidRequests = [
          // Wrong type data type
          {
            type: 123,
            operation: 'success',
            location: 'test-location',
          },
          // Wrong operation data type
          {
            type: 'peginNative',
            operation: 123,
            location: 'test-location',
          },
          // Wrong location data type
          {
            type: 'peginNative',
            operation: 'success',
            location: 123,
          },
          // Wrong error data type
          {
            type: 'peginNative',
            operation: 'error',
            location: 'test-location',
            error: 'not-an-object',
          },
        ];
        
        for (const requestBody of invalidRequests) {
          await client
            .post('/logs')
            .send(requestBody)
            .expect(422); // Unprocessable Entity
        }
      });
    });

    describe('boundary conditions', () => {
      it('should handle minimum valid values', async () => {
        const requestBody = {
          type: 'peginNative',
          operation: 'success',
          location: 'abc', // minimum length
          error: {
            message: 'abc', // minimum length
            code: 0,
          },
        };

        await client
          .post('/logs')
          .send(requestBody)
          .expect(200);
      });

      it('should handle maximum valid values', async () => {
        const requestBody = {
          type: 'pegoutFlyover',
          operation: 'error',
          location: 'a'.repeat(50), // maximum length
          error: {
            message: 'a'.repeat(30), // maximum length
            code: Number.MAX_SAFE_INTEGER,
          },
        };

        await client
          .post('/logs')
          .send(requestBody)
          .expect(200);
      });

      it('should handle negative error codes', async () => {
        const requestBody = {
          type: 'peginNative',
          operation: 'error',
          location: 'test-location',
          error: {
            message: 'test-error',
            code: -1,
          },
        };

        await client
          .post('/logs')
          .send(requestBody)
          .expect(200);
      });

      it('should handle zero error code', async () => {
        const requestBody = {
          type: 'peginNative',
          operation: 'error',
          location: 'test-location',
          error: {
            message: 'test-error',
            code: 0,
          },
        };

        await client
          .post('/logs')
          .send(requestBody)
          .expect(200);
      });
    });

    describe('response validation', () => {
      it('should return 200 status code for valid requests', async () => {
        const requestBody = {
          type: 'peginNative',
          operation: 'success',
          location: 'test-location',
        };

        const res = await client
          .post('/logs')
          .send(requestBody)
          .expect(200);

        // Verify response is empty (controller sends empty response)
        expect(res.body).to.be.empty();
      });

      it('should return 200 status code for valid error requests', async () => {
        const requestBody = {
          type: 'peginNative',
          operation: 'error',
          location: 'test-location',
          error: {
            message: 'test-error',
            code: 100,
          },
        };

        const res = await client
          .post('/logs')
          .send(requestBody)
          .expect(200);

        // Verify response is empty (controller sends empty response)
        expect(res.body).to.be.empty();
      });
    });

    describe('comprehensive valid combinations', () => {
      it('should accept all valid type and operation combinations', async () => {
        const types = ['peginNative', 'peginFlyover', 'pegoutNative', 'pegoutFlyover'];
        const operations = ['success', 'error'];
        
        for (const type of types) {
          for (const operation of operations) {
            const requestBody = {
              type,
              operation,
              location: 'test-location',
            };

            await client
              .post('/logs')
              .send(requestBody)
              .expect(200);
          }
        }
      });

      it('should accept all valid combinations with error field', async () => {
        const types = ['peginNative', 'peginFlyover', 'pegoutNative', 'pegoutFlyover'];
        const operations = ['success', 'error'];
        
        for (const type of types) {
          for (const operation of operations) {
            const requestBody = {
              type,
              operation,
              location: 'test-location',
              error: {
                message: 'test-error',
                code: 100,
              },
            };

            await client
              .post('/logs')
              .send(requestBody)
              .expect(200);
          }
        }
      });
    });
  });
});
