from collections.abc import Mapping
from io import BytesIO

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import BadHeaderError, EmailMessage
from django.core.validators import validate_email
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import APIException, ParseError
from rest_framework.parsers import BaseParser, JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import security
from accounts.views import client_origin

MAX_BODY_BYTES = 64 * 1024


class ContactBodyTooLarge(APIException):
    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_detail = "La solicitud supera el tamaño permitido."


class ContactUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "El formulario de contacto no está disponible en este momento."


class ContactJSONParser(BaseParser):
    media_type = "application/json"

    def parse(self, stream, media_type=None, parser_context=None):
        # DRF buffers the whole body for JSONParser subclasses; read this public
        # endpoint's input through BaseParser so the limit applies before decoding.
        body = stream.read(MAX_BODY_BYTES + 1)
        if len(body) > MAX_BODY_BYTES:
            raise ContactBodyTooLarge()
        try:
            return JSONParser().parse(BytesIO(body), parser_context={"encoding": "utf-8"})
        except (ParseError, RecursionError):
            raise ParseError("El JSON de la solicitud no es válido.") from None


class ContactSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    email = serializers.EmailField(max_length=254)
    message = serializers.CharField(max_length=3000)

    def to_internal_value(self, data):
        if not isinstance(data, Mapping) or set(data) - set(self.fields):
            raise serializers.ValidationError({"non_field_errors": ["Envía solo nombre, correo y mensaje."]})
        errors = {}
        for key, value in data.items():
            if not isinstance(value, str):
                errors[key] = "Debe ser texto."
                continue
            try:
                value.encode("utf-8")
            except UnicodeEncodeError:
                errors[key] = "Debe ser texto UTF-8 válido."
        if errors:
            raise serializers.ValidationError(errors)
        return super().to_internal_value(data)


@method_decorator(never_cache, name="dispatch")
class ContactView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [ContactJSONParser]
    renderer_classes = [JSONRenderer]

    @extend_schema(
        request=ContactSerializer,
        responses={
            204: None,
            400: OpenApiResponse(description="Campos o JSON inválidos."),
            413: OpenApiResponse(description="El cuerpo supera 64 KiB."),
            415: OpenApiResponse(description="Solo se admite application/json."),
            429: OpenApiResponse(description="Cuota excedida o control de intentos no disponible."),
            503: OpenApiResponse(description="No se pudo aceptar el mensaje."),
        },
        auth=[],
    )
    def post(self, request):
        security.rate_limit("contact_origin", client_origin(request))
        serializer = ContactSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        recipient = settings.CONTACT_RECIPIENT_EMAIL
        sender = settings.DEFAULT_FROM_EMAIL
        try:
            validate_email(recipient)
            validate_email(sender)
        except ValidationError:
            raise ContactUnavailable() from None

        security.rate_limit("contact_global", "all")
        data = serializer.validated_data
        email = EmailMessage(
            subject="Nueva consulta desde Llave Extra",
            body=f"Nombre: {data['name']}\nCorreo: {data['email']}\n\n{data['message']}",
            from_email=sender,
            to=[recipient],
            reply_to=[data["email"]],
        )
        try:
            sent = email.send(fail_silently=False)
        except (BadHeaderError, OSError):
            raise ContactUnavailable() from None
        if sent != 1:
            raise ContactUnavailable()
        return Response(status=status.HTTP_204_NO_CONTENT)
