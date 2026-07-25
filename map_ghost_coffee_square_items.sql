begin;

with square_mappings(item_name, square_item_id) as (
    values
        ('Avocado Toast', 'YHJHWNJBBJE6ZNAOP2I5F4XT'),
        ('Bagel with Cream Cheese', 'QDX7I7J2MDNYVTP7TZ4XZ7PW'),
        ('Caprese Mozzarella', '72BPUY4QLYHPXEVR4TRVYMXN'),
        ('Chorizo & Smoked Gouda', '44FCZKVUIN7KFRIVQQLQ3AHB'),
        ('Grilled Cheese', 'AZXPII6FYKSBFQGK4ACFSHVQ'),
        ('Ham & Cheese Croissant', 'BRGHQN27RRBMTIBV6AXLQLTX'),
        ('Hot Honey Chicken on Waffles', 'NB2SR2JVEUAJY3CMEQRGUMEG'),
        ('Maple Bacon Avocado', 'I4MRNP6XBGO6O2BOHCEBBPJR'),
        ('Oatmeal Cup', '6AXURTTEFJS72RTSF5BJX5IQ'),
        ('Parfait', 'ZCBS4HB2H27B3CT2HFILGOCH'),
        ('Ricotta Toast and Jam', 'NN33MECSUVLYB65BIBITLFLA'),
        ('Sausage Egg Biscuit', 'RDA4IM3RGFL4GY6YKSDYTIDR')
)
update public.menu_items as menu
set square_item_id = mapping.square_item_id
from square_mappings as mapping
where menu.item_name = mapping.item_name;

do $$
declare
    matched_mapping_count integer;
begin
    select count(*)
    into matched_mapping_count
    from public.menu_items
    where (item_name, square_item_id) in (
        ('Avocado Toast', 'YHJHWNJBBJE6ZNAOP2I5F4XT'),
        ('Bagel with Cream Cheese', 'QDX7I7J2MDNYVTP7TZ4XZ7PW'),
        ('Caprese Mozzarella', '72BPUY4QLYHPXEVR4TRVYMXN'),
        ('Chorizo & Smoked Gouda', '44FCZKVUIN7KFRIVQQLQ3AHB'),
        ('Grilled Cheese', 'AZXPII6FYKSBFQGK4ACFSHVQ'),
        ('Ham & Cheese Croissant', 'BRGHQN27RRBMTIBV6AXLQLTX'),
        ('Hot Honey Chicken on Waffles', 'NB2SR2JVEUAJY3CMEQRGUMEG'),
        ('Maple Bacon Avocado', 'I4MRNP6XBGO6O2BOHCEBBPJR'),
        ('Oatmeal Cup', '6AXURTTEFJS72RTSF5BJX5IQ'),
        ('Parfait', 'ZCBS4HB2H27B3CT2HFILGOCH'),
        ('Ricotta Toast and Jam', 'NN33MECSUVLYB65BIBITLFLA'),
        ('Sausage Egg Biscuit', 'RDA4IM3RGFL4GY6YKSDYTIDR')
    );

    if matched_mapping_count <> 12 then
        raise exception
            'Expected 12 verified Square mappings, found %',
            matched_mapping_count;
    end if;
end;
$$;

commit;
