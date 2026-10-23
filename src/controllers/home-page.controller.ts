import fs from 'fs';
import path from 'path';
import {inject} from '@loopback/core';
import {get, oas, RestBindings, Response} from '@loopback/rest';

/**
 * The landing page, read once at startup.
 *
 * Deliberately not served by `serve-static`. That middleware resolves a
 * directory request without a trailing slash by starting an `fs.stat` and
 * issuing a redirect from the callback — work that outlives the response if the
 * client disconnects first, at which point it sets headers on a finished
 * response and throws from a library callback where the application has no
 * seam to catch it. Reading the file once and returning a string keeps the
 * whole request synchronous, so nothing can outlive the response.
 */
const LANDING_PAGE = fs.readFileSync(
  path.join(__dirname, '../../public/index.html'),
  'utf8',
);

export class HomePageController {
  constructor(
    @inject(RestBindings.Http.RESPONSE) private response: Response,
  ) {}

  /**
   * `GET /` and `GET /index.html` — the service's landing page.
   *
   * @returns The landing page HTML.
   */
  @get('/', {
    responses: {
      '200': {
        description: 'Landing page',
        content: {'text/html': {schema: {type: 'string'}}},
      },
    },
  })
  @oas.response(200, {'text/html': {schema: {type: 'string'}}})
  homePage(): Response {
    return this.sendLandingPage();
  }

  @get('/index.html', {
    responses: {
      '200': {
        description: 'Landing page',
        content: {'text/html': {schema: {type: 'string'}}},
      },
    },
  })
  indexHtml(): Response {
    return this.sendLandingPage();
  }

  /** Writes the page, unless the client has already gone away. */
  private sendLandingPage(): Response {
    if (this.response.writableEnded || this.response.destroyed) {
      return this.response;
    }
    this.response
      .status(200)
      .contentType('text/html')
      .send(LANDING_PAGE);
    return this.response;
  }
}
