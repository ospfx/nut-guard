include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-nut-guard
PKG_VERSION:=0.2.0
PKG_RELEASE:=1

PKG_MAINTAINER:=ospfx
PKG_LICENSE:=AGPL-3.0-or-later
PKG_LICENSE_FILES:=LICENSE

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-nut-guard
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI support for Nut Guard
  DEPENDS:=+luci-base +nut-guard
  PKGARCH:=all
endef

define Package/luci-app-nut-guard/description
  Provides a "Services → Nut Guard" page in LuCI for ImmortalWrt / OpenWrt.
  Allows viewing real-time UPS status and editing the NUT connection
  settings (stored in /etc/config/nut-guard via UCI).
  No extra management port is required.
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
endef

define Build/Compile
endef

define Package/luci-app-nut-guard/install
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/nut-guard
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/nut-guard/overview.js \
		$(1)/www/luci-static/resources/view/nut-guard/overview.js

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-nut-guard.json \
		$(1)/usr/share/luci/menu.d/luci-app-nut-guard.json

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-nut-guard.json \
		$(1)/usr/share/rpcd/acl.d/luci-app-nut-guard.json
endef

$(eval $(call BuildPackage,luci-app-nut-guard))
