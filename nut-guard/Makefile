include $(TOPDIR)/rules.mk

PKG_NAME:=nut-guard
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT
PKG_MAINTAINER:=ospfx

include $(INCLUDE_DIR)/package.mk

define Package/nut-guard
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Nut Guard - NUT UPS monitor backend
  DEPENDS:=+lua +libuci-lua +libnixio-lua
  PKGARCH:=all
endef

define Package/nut-guard/description
  Backend daemon/scripts for Nut Guard UPS monitor.
  Provides a Lua-based NUT (Network UPS Tools) client,
  UCI configuration and procd init script.
endef

define Package/nut-guard/conffiles
/etc/config/nut_guard
endef

define Build/Compile
endef

define Package/nut-guard/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/nut_guard $(1)/etc/config/nut_guard

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/init.d/nut-guard $(1)/etc/init.d/nut-guard

	$(INSTALL_DIR) $(1)/usr/libexec/nut-guard
	$(INSTALL_BIN) ./root/usr/libexec/nut-guard/core.lua \
		$(1)/usr/libexec/nut-guard/core.lua
endef

$(eval $(call BuildPackage,nut-guard))
