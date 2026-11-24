from drf_spectacular.generators import SchemaGenerator


def test_contextual_selection_openapi_describes_private_response_contracts():
    schema = SchemaGenerator().get_schema(request=None, public=True)
    paths, components = schema["paths"], schema["components"]["schemas"]

    def resolve(value):
        return components[value["$ref"].rsplit("/", 1)[-1]]

    def response(operation):
        return resolve(operation["responses"]["200"]["content"]["application/json"]["schema"])

    redeem = paths["/api/v1/referrals/redeem/"]["post"]
    assert set(response(redeem)["properties"]) == {"collaborator_id", "collaborator_name", "granted_at"}
    selection = paths["/api/v1/folders/{folder_id}/benefits/"]["get"]
    page = response(selection)
    assert set(page["properties"]) == {"count", "next", "previous", "collaborator", "results"}
    assert set(resolve(page["properties"]["collaborator"])["properties"]) == {"id", "name"}
    item = resolve(page["properties"]["results"]["items"])
    assert {"provider", "image_url", "conditions", "title"} <= set(item["properties"])
    provider = resolve(item["properties"]["provider"])
    assert {"name", "image_url", "status"} <= set(provider["properties"])
    assert "provenance" not in provider["properties"]
    assert {parameter["name"] for parameter in selection["parameters"]} == {"folder_id", "page", "page_size"}
    summary = paths["/api/v1/admin/collaborators/{id}/summary/"]["get"]
    assert set(response(summary)["properties"]) == {"collaborator_id", "linked_clients", "valid_attributed_consumptions"}
