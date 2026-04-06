include $(TOPDIR)/rules.mk

LUCI_NAME:=luci-app-nut-guard
LUCI_TITLE:=LuCI Support for Nut Guard
LUCI_DEPENDS:=+luci-base +nut-guard

include $(TOPDIR)/feeds/luci/luci.mk

define Package/luci-app-nut-guard/description
  LuCI web interface for the Nut Guard UPS monitoring daemon.
  Adds a "Nut Guard" entry under the Services menu in LuCI,
  providing UPS status display and UCI-based configuration.
  No extra management port required.
endef

$(eval $(call BuildPackage,$(LUCI_NAME)))
