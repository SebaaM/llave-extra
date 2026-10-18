class PrivateAPIHeadersMiddleware:
    """Keep bearer, grant and recovery responses out of caches and referrers."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith(("/api/v1/auth/", "/api/v1/referrals/", "/api/v1/me/folders/", "/api/v1/collaborator/")):
            response["Cache-Control"] = "no-store"
            response["Referrer-Policy"] = "no-referrer"
        return response
