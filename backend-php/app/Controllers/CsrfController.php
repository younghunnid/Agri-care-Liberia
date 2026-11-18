<?php
declare(strict_types=1);

namespace Agri\Controllers;

use Agri\Http\Request;
use Agri\Http\Response;

/** GET /api/v1/csrf-token — returns the token that the session step already issued (cookie agri_csrf), never a second, different one. */
final class CsrfController
{
    public function __invoke(Request $req, array $params = []): Response
    {
        return Response::json(200, ['csrfToken' => (string)$req->attributes['csrfToken']], ['Cache-Control' => 'no-store']);
    }
}
