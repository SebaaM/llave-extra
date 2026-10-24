class PrivateAPIHeadersMiddleware:
    """Keep bearer, grant and recovery responses out of caches and referrers."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith(("/api/v1/auth/", "/api/v1/referrals/", "/api/v1/me/", "/api/v1/consumptions/", "/api/v1/collaborator/", "/api/v1/folders/", "/api/v1/provider/", "/api/v1/catalog/", "/api/v1/admin/", "/api/v1/site-settings/")):
            response["Cache-Control"] = "no-store"
            response["Referrer-Policy"] = "no-referrer"
        return response
