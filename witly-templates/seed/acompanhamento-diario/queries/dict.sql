-- Dicionário de links: field_ad_name -> URL do post (permalink)
-- Fonte: wtl_paidmedia (conversion) → facebook_ads.ad_history (ad→creative)
--        → facebook_ads.creative_history (criativo/permalink)
-- Um field_ad_name pode repetir em vários ad_id (recriações): o DISTINCT ON pega o mais
-- recente por _fivetran_synced. 1ª coluna = field_ad_name (chave); 2ª = a URL.
SELECT DISTINCT ON (pm.field_ad_name)
  pm.field_ad_name,
  COALESCE(
    ch.instagram_permalink_url,
    ch.object_story_link_data_link,
    ch.link_url,
    ah.preview_shareable_link
  ) AS post_url
FROM wtl_paidmedia pm
LEFT JOIN facebook_ads.ad_history ah
  ON ah.id::varchar = pm.field_ad_id
LEFT JOIN facebook_ads.creative_history ch
  ON ch.id::varchar = ah.creative_id::varchar
WHERE pm.conversion = {{field_conversion}}
  AND pm.field_ad_name IS NOT NULL
ORDER BY pm.field_ad_name, ah._fivetran_synced DESC NULLS LAST;
